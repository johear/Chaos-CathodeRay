// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
// ============================================================================
// 03b-mixbus-plugins.js — Milestone 3:
//   1. Virtual "Mix Circle" Bus Source (src_mixbus) & Physics
//   2. Custom ISF v2 Shader Sources, Hot-Swap Lifecycle & Color Helpers
//   3. Stackable Per-Surface & Master GPU Post-FX Chain State
//   4. Open .wmplugin.json Community Plugin Spec (Import / Export / Registry)
// ============================================================================

function rgbaArrayToHex(arr) {
  if (!Array.isArray(arr)) return '#6fd3ff';
  const r = clamp(Math.round((Number(arr[0]) || 0) * 255), 0, 255);
  const g = clamp(Math.round((Number(arr[1]) || 0) * 255), 0, 255);
  const b = clamp(Math.round((Number(arr[2]) || 0) * 255), 0, 255);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function hexToRgbaArray(hex, alpha = 1.0) {
  const rgb = hexToRgbNorm(hex || '#ffffff');
  return [rgb[0], rgb[1], rgb[2], clamp(Number(alpha ?? 1.0), 0, 1)];
}

// ----------------------------------------------------------------------------
// 1. VIRTUAL "MIX CIRCLE" BUS SOURCE (src_mixbus)
// ----------------------------------------------------------------------------

function createMixbusOrb(sourceId, x = 0.0, y = 0.0, overrides = {}) {
  const idx = state.nextFxNum++;
  return {
    id: overrides.id || `orb_${idx}_${Math.random().toString(36).slice(2, 6)}`,
    sourceId: sourceId || 'src_shards',
    x: Number(overrides.x ?? x),
    y: Number(overrides.y ?? y),
    targetX: Number(overrides.targetX ?? overrides.x ?? x),
    targetY: Number(overrides.targetY ?? overrides.y ?? y),
    vx: Number(overrides.vx ?? 0),
    vy: Number(overrides.vy ?? 0),
    gain: clamp(Number(overrides.gain ?? 1.0), 0, 2),
    muted: !!overrides.muted,
    accent: overrides.accent || SURFACE_ACCENTS[(idx - 1) % SURFACE_ACCENTS.length]
  };
}

function createMixbusSource(id = 'src_mixbus', name = '◎ Mix Circle Bus', opts = {}) {
  const width = opts.width || 1920;
  const height = opts.height || 1080;
  const texture = createGlTexture(width, height);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const defaultOrbs = Array.isArray(opts.orbs) && opts.orbs.length > 0
    ? opts.orbs.map(o => createMixbusOrb(o.sourceId, o.x, o.y, o))
    : [
        createMixbusOrb('src_shards', -0.24, -0.06, { id: 'orb_def_1', accent: '#ff9e5e' }),
        createMixbusOrb('src_cloud', 0.34, 0.14, { id: 'orb_def_2', accent: '#b58cff' }),
        createMixbusOrb('src_caustics', 0.02, -0.52, { id: 'orb_def_3', accent: '#6fd3ff' }),
        createMixbusOrb('src_laser', 0.78, 0.78, { id: 'orb_def_4', accent: '#34e89e' })
      ];

  return {
    id,
    name,
    kind: 'mixbus',
    width,
    height,
    texture,
    fbo,
    flipY: false,
    mirrorX: false,
    offline: false,
    playing: opts.playing !== false,
    blendMode: opts.blendMode || 'screen', // 'normal' | 'additive' | 'screen' | 'lighten'
    falloffCurve: clamp(Number(opts.falloffCurve ?? 1.35), 0.25, 4.0),
    autoOrbit: clamp(Number(opts.autoOrbit ?? 0.0), -3.0, 3.0),
    damping: clamp(Number(opts.damping ?? 0.80), 0.0, 0.96),
    editOrbsMode: opts.editOrbsMode !== false,
    orbs: defaultOrbs,
    selectedOrbId: defaultOrbs[0] ? defaultOrbs[0].id : null,
    swatchCss: 'radial-gradient(circle at 50% 50%, #34e89e 0%, #6fd3ff 44%, #111827 82%)'
  };
}

function getMixbusSource() {
  return state.sources.find(s => s.kind === 'mixbus') || null;
}

function computeMixbusOrbWeight(orb, falloffCurve = 1.35) {
  if (!orb || orb.muted) return 0.0;
  const r = Math.hypot(orb.x || 0, orb.y || 0);
  if (r >= 1.0) return 0.0;
  const exp = clamp(Number(falloffCurve) || 1.35, 0.25, 4.0);
  return clamp(Math.pow(1.0 - r, exp) * (orb.gain ?? 1.0), 0.0, 1.0);
}

function updateMixbusPhysics(mixSrc, dt) {
  if (!mixSrc || mixSrc.kind !== 'mixbus' || !Array.isArray(mixSrc.orbs)) return;
  const spin = (mixSrc.playing !== false) ? (mixSrc.autoOrbit || 0) : 0;
  const damp = clamp(mixSrc.damping ?? 0.80, 0.0, 0.96);
  const alpha = damp <= 0.01 ? 1.0 : (1.0 - Math.pow(damp, Math.max(0.2, dt * 60)));
  // Damped flick-throw velocity decay (higher damping = longer silky glide)
  const flickDecay = Math.pow(0.06 + damp * 0.86, Math.max(0.2, dt * 12));
  let anyMotion = false;

  for (const orb of mixSrc.orbs) {
    // 1. Apply flick-throw momentum when orb is not actively held by pointer
    if (!orb._dragging && (Math.abs(orb.vx || 0) > 0.002 || Math.abs(orb.vy || 0) > 0.002)) {
      orb.targetX += (orb.vx || 0) * dt;
      orb.targetY += (orb.vy || 0) * dt;
      orb.vx = (orb.vx || 0) * flickDecay;
      orb.vy = (orb.vy || 0) * flickDecay;

      const r = Math.hypot(orb.targetX, orb.targetY);
      if (r > 1.24) {
        // Soft elastic bounce / park at outer Standby Orbit boundary
        const nx = orb.targetX / r;
        const ny = orb.targetY / r;
        orb.targetX = nx * 1.14;
        orb.targetY = ny * 1.14;
        orb.vx *= 0.25;
        orb.vy *= 0.25;
      }
      if (Math.hypot(orb.vx, orb.vy) < 0.003) {
        orb.vx = 0;
        orb.vy = 0;
      }
      anyMotion = true;
    }

    // 2. Gentle magnetic settle onto Standby Orbit ring (r = 1.12) when parked just outside rim
    if (!orb._dragging && Math.hypot(orb.vx || 0, orb.vy || 0) < 0.04) {
      const tr = Math.hypot(orb.targetX, orb.targetY);
      if (tr > 1.015 && tr < 1.24 && Math.abs(tr - 1.12) > 0.004) {
        const nr = tr + (1.12 - tr) * Math.min(1, dt * 6.0);
        const ang = Math.atan2(orb.targetY, orb.targetX);
        orb.targetX = Math.cos(ang) * nr;
        orb.targetY = Math.sin(ang) * nr;
        anyMotion = true;
      }
    }

    // 3. Auto-Orbit spin for active orbs inside the mixing disc (standby orbs stay parked!)
    if (Math.abs(spin) > 0.002 && !orb._dragging) {
      const tr = Math.hypot(orb.targetX, orb.targetY);
      if (tr > 0.005 && tr < 1.01) {
        const ang = Math.atan2(orb.targetY, orb.targetX) + spin * dt;
        orb.targetX = Math.cos(ang) * tr;
        orb.targetY = Math.sin(ang) * tr;
        anyMotion = true;
      }
    }

    const dx = orb.targetX - orb.x;
    const dy = orb.targetY - orb.y;
    if (Math.abs(dx) > 1e-4 || Math.abs(dy) > 1e-4) {
      orb.x += dx * alpha;
      orb.y += dy * alpha;
      anyMotion = true;
    }
  }

  if (anyMotion) {
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  }
}

function addMixbusOrb(mixSrc, sourceId, opts = {}) {
  if (!mixSrc || mixSrc.kind !== 'mixbus') return null;
  if (!sourceId || sourceId === mixSrc.id) {
    const fallback = state.sources.find(s => s.id !== mixSrc.id);
    sourceId = fallback ? fallback.id : 'src_shards';
  }
  const n = mixSrc.orbs.length;
  const ang = (n * 2.399963) % (Math.PI * 2);
  const rad = opts.x !== undefined ? 0 : 0.42;
  const x = opts.x !== undefined ? opts.x : Math.cos(ang) * rad;
  const y = opts.y !== undefined ? opts.y : Math.sin(ang) * rad;
  const orb = createMixbusOrb(sourceId, x, y, opts);
  mixSrc.orbs.push(orb);
  mixSrc.selectedOrbId = orb.id;
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  return orb;
}

function removeMixbusOrb(mixSrc, orbId) {
  if (!mixSrc || mixSrc.kind !== 'mixbus' || mixSrc.orbs.length <= 1) return false;
  const idx = mixSrc.orbs.findIndex(o => o.id === orbId);
  if (idx < 0) return false;
  mixSrc.orbs.splice(idx, 1);
  if (mixSrc.selectedOrbId === orbId) {
    mixSrc.selectedOrbId = mixSrc.orbs[0] ? mixSrc.orbs[0].id : null;
  }
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  return true;
}

function soloMixbusOrb(mixSrc, orbId) {
  if (!mixSrc || mixSrc.kind !== 'mixbus') return;
  const others = mixSrc.orbs.filter(o => o.id !== orbId);
  mixSrc.orbs.forEach(o => {
    o.vx = 0;
    o.vy = 0;
    if (o.id === orbId) {
      o.targetX = 0.0;
      o.targetY = 0.0;
      o.muted = false;
    }
  });
  others.forEach((o, idx) => {
    const ang = (idx / Math.max(1, others.length)) * Math.PI * 2 - Math.PI * 0.5;
    o.targetX = Math.cos(ang) * 1.12;
    o.targetY = Math.sin(ang) * 1.12;
  });
  mixSrc.selectedOrbId = orbId;
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
}

function cloneMixbusState(mixSrc) {
  if (!mixSrc || mixSrc.kind !== 'mixbus') return null;
  return {
    playing: mixSrc.playing !== false,
    blendMode: mixSrc.blendMode || 'screen',
    falloffCurve: mixSrc.falloffCurve ?? 1.35,
    autoOrbit: mixSrc.autoOrbit ?? 0.0,
    damping: mixSrc.damping ?? 0.80,
    editOrbsMode: mixSrc.editOrbsMode !== false,
    selectedOrbId: mixSrc.selectedOrbId || null,
    orbs: (mixSrc.orbs || []).map(o => ({
      id: o.id,
      sourceId: o.sourceId,
      x: o.x,
      y: o.y,
      targetX: o.targetX,
      targetY: o.targetY,
      gain: o.gain ?? 1.0,
      muted: !!o.muted,
      accent: o.accent || '#6fd3ff'
    }))
  };
}

function applyMixbusState(mixSrc, snap) {
  if (!mixSrc || !snap) return;
  mixSrc.playing = snap.playing !== false;
  mixSrc.blendMode = snap.blendMode || 'screen';
  mixSrc.falloffCurve = clamp(Number(snap.falloffCurve ?? 1.35), 0.25, 4.0);
  mixSrc.autoOrbit = clamp(Number(snap.autoOrbit ?? 0.0), -3.0, 3.0);
  mixSrc.damping = clamp(Number(snap.damping ?? 0.80), 0.0, 0.96);
  if (snap.editOrbsMode !== undefined) mixSrc.editOrbsMode = !!snap.editOrbsMode;
  if (Array.isArray(snap.orbs) && snap.orbs.length > 0) {
    mixSrc.orbs = snap.orbs.map(o => createMixbusOrb(o.sourceId, o.x, o.y, o));
  }
  mixSrc.selectedOrbId = snap.selectedOrbId || (mixSrc.orbs[0] ? mixSrc.orbs[0].id : null);
}

// ----------------------------------------------------------------------------
// 2. CUSTOM ISF v2 SHADER SOURCES & LIVE HOT-SWAP LIFECYCLE
// ----------------------------------------------------------------------------

function buildDefaultIsfValues(inputs, prevValues = {}) {
  const out = {};
  if (!Array.isArray(inputs)) return out;
  for (const inp of inputs) {
    if (!inp || inp.type === 'image' || inp.type === 'event') continue;
    const prev = prevValues ? prevValues[inp.name] : undefined;
    if (inp.type === 'float') {
      out[inp.name] = Number.isFinite(Number(prev)) ? clamp(Number(prev), inp.min, inp.max) : inp.defaultVal;
    } else if (inp.type === 'bool') {
      out[inp.name] = typeof prev === 'boolean' ? prev : !!inp.defaultVal;
    } else if (inp.type === 'long') {
      out[inp.name] = Number.isFinite(Number(prev)) ? Math.round(Number(prev)) : inp.defaultVal;
    } else if (inp.type === 'color') {
      out[inp.name] = (Array.isArray(prev) && prev.length >= 3)
        ? [Number(prev[0]) || 0, Number(prev[1]) || 0, Number(prev[2]) || 0, Number(prev[3] ?? 1)]
        : [...inp.defaultVal];
    } else if (inp.type === 'point2D') {
      out[inp.name] = (Array.isArray(prev) && prev.length >= 2)
        ? [Number(prev[0]) || 0, Number(prev[1]) || 0]
        : [...inp.defaultVal];
    }
  }
  return out;
}

function disposeIsfPassBuffers(srcObj) {
  if (!srcObj || !srcObj._passBuffers) return;
  for (const pair of srcObj._passBuffers.values()) {
    if (pair.read) {
      if (pair.read.fbo) try { gl.deleteFramebuffer(pair.read.fbo); } catch (_) {}
      if (pair.read.tex) try { gl.deleteTexture(pair.read.tex); } catch (_) {}
    }
    if (pair.write) {
      if (pair.write.fbo) try { gl.deleteFramebuffer(pair.write.fbo); } catch (_) {}
      if (pair.write.tex) try { gl.deleteTexture(pair.write.tex); } catch (_) {}
    }
  }
  srcObj._passBuffers.clear();
}

function compileAndAttachIsfSource(srcObj, newCode) {
  if (!srcObj) return { ok: false, error: 'Missing ISF source target' };
  srcObj.isfCode = String(newCode || '');

  if (typeof compileIsfRuntimeSafe === 'function') {
    const res = compileIsfRuntimeSafe(srcObj.isfCode);
    if (!res.ok) {
      srcObj.compileOk = false;
      srcObj.compileError = res.error || 'Shader compilation failed';
      return { ok: false, error: srcObj.compileError };
    }
    // Delete superseded GL program while keeping persistent pass FBOs if targets match
    if (srcObj._isfRuntime && srcObj._isfRuntime.prog) {
      try { gl.deleteProgram(srcObj._isfRuntime.prog); } catch (_) {}
    }
    srcObj._isfRuntime = res.runtime;
    srcObj.isfMeta = res.meta;
    srcObj.isfValues = buildDefaultIsfValues(res.meta.inputs, srcObj.isfValues);
    srcObj.compileOk = true;
    srcObj.compileError = null;
    state._pluginSyncRev = (state._pluginSyncRev || 0) + 1;
    return { ok: true, meta: res.meta };
  }

  // Fallback before GL engine finishes booting
  const parsed = transpileIsfToWebGL2(srcObj.isfCode);
  if (!parsed.ok) {
    srcObj.compileOk = false;
    srcObj.compileError = parsed.error;
    return { ok: false, error: parsed.error };
  }
  srcObj.isfMeta = parsed.meta;
  srcObj.isfValues = buildDefaultIsfValues(parsed.meta.inputs, srcObj.isfValues);
  srcObj._needsInitialCompile = true;
  srcObj.compileOk = true;
  srcObj.compileError = null;
  return { ok: true, meta: parsed.meta };
}

function createCustomIsfSource(opts = {}) {
  const width = opts.width || 1920;
  const height = opts.height || 1080;
  const texture = createGlTexture(width, height);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const tpl = ISF_STARTER_TEMPLATES.neon_rings;
  const id = opts.id || `src_isf_${state.nextSourceNum++}`;
  const isfCode = opts.isfCode || tpl.code;

  const srcObj = {
    id,
    name: opts.name || `ISF Shader ${state.nextSourceNum - 1}`,
    author: opts.author || APP_NAME,
    license: opts.license || APP_PLUGIN_DEFAULT_LICENSE,
    kind: 'isf',
    width,
    height,
    texture,
    fbo,
    flipY: false,
    mirrorX: !!opts.mirrorX,
    offline: false,
    playing: opts.playing !== false,
    simTime: opts.simTime || 0,
    frameIndex: 0,
    speed: clamp(Number(opts.speed ?? 1.0), 0.0, 4.0),
    isfCode,
    isfMeta: null,
    isfValues: opts.isfValues ? JSON.parse(JSON.stringify(opts.isfValues)) : {},
    isfEvents: {},
    compileOk: false,
    compileError: null,
    _isfRuntime: null,
    _passBuffers: new Map(),
    swatchCss: opts.swatchCss || 'linear-gradient(135deg, #0b132b, #34e89e, #ff4f9a)'
  };

  compileAndAttachIsfSource(srcObj, isfCode);
  if (opts.isfValues) {
    srcObj.isfValues = buildDefaultIsfValues(srcObj.isfMeta ? srcObj.isfMeta.inputs : [], opts.isfValues);
  }
  return srcObj;
}

function addNewCustomIsfSource(opts = {}, activateNow = true) {
  const srcObj = createCustomIsfSource(opts);
  const existingIdx = state.sources.findIndex(s => s.id === srcObj.id);
  if (existingIdx >= 0) {
    const old = state.sources[existingIdx];
    disposeIsfPassBuffers(old);
    if (old._isfRuntime && old._isfRuntime.prog) {
      try { gl.deleteProgram(old._isfRuntime.prog); } catch (_) {}
    }
    if (old.fbo) try { gl.deleteFramebuffer(old.fbo); } catch (_) {}
    if (old.texture) try { gl.deleteTexture(old.texture); } catch (_) {}
    state.sources[existingIdx] = srcObj;
  } else {
    state.sources.push(srcObj);
  }

  state._pluginSyncRev = (state._pluginSyncRev || 0) + 1;
  if (activateNow && !state.isProjectorRole) {
    state.shaderEditorSourceId = srcObj.id;
    assignOrActivateNewSource(srcObj);
  } else {
    if (typeof renderMediaBin === 'function') renderMediaBin();
    if (typeof syncInspectorUI === 'function') syncInspectorUI();
  }
  return srcObj;
}

function forkShaderToStudio(sourceToFork = null) {
  let tplKey = 'neon_rings';
  let forkName = `ISF Shader ${state.nextSourceNum}`;
  if (sourceToFork && sourceToFork.kind === 'isf') {
    const copy = addNewCustomIsfSource({
      name: `${sourceToFork.name} (Copy)`,
      isfCode: sourceToFork.isfCode,
      isfValues: sourceToFork.isfValues,
      speed: sourceToFork.speed
    }, true);
    openShaderStudioDrawer(copy.id);
    showToast(`Forked ISF Shader: ${copy.name}`);
    return copy;
  }
  if (sourceToFork && sourceToFork.kind === 'shader') {
    if (sourceToFork.shaderKind === 'laser' || sourceToFork.shaderKind === 'gridscan') tplKey = 'arch_scanlines';
    else if (sourceToFork.shaderKind === 'cloud' || sourceToFork.shaderKind === 'liquid') tplKey = 'reaction_pingpong';
    forkName = `${sourceToFork.name} (ISF Remix)`;
  }
  const tpl = ISF_STARTER_TEMPLATES[tplKey] || ISF_STARTER_TEMPLATES.neon_rings;
  const created = addNewCustomIsfSource({
    name: forkName,
    isfCode: tpl.code
  }, true);
  openShaderStudioDrawer(created.id);
  showToast(`Created Live ISF Shader: ${created.name}`);
  return created;
}

function removeCustomSource(sourceId) {
  const idx = state.sources.findIndex(s => s.id === sourceId);
  if (idx < 0) return false;
  const src = state.sources[idx];
  if (src.kind === 'shader' || src.kind === 'mixbus') return false; // Built-in sources stay pinned

  disposeIsfPassBuffers(src);
  if (src._isfRuntime && src._isfRuntime.prog) {
    try { gl.deleteProgram(src._isfRuntime.prog); } catch (_) {}
  }
  if (src.fbo) try { gl.deleteFramebuffer(src.fbo); } catch (_) {}
  if (src._loopHoldFbo) {
    if (src._loopHoldFbo.fbo) try { gl.deleteFramebuffer(src._loopHoldFbo.fbo); } catch (_) {}
    if (src._loopHoldFbo.tex) try { gl.deleteTexture(src._loopHoldFbo.tex); } catch (_) {}
  }
  if (src._loopLiveTex) try { gl.deleteTexture(src._loopLiveTex); } catch (_) {}
  if (src._loopOutFbo) try { gl.deleteFramebuffer(src._loopOutFbo); } catch (_) {}
  if (src.texture) try { gl.deleteTexture(src.texture); } catch (_) {}
  if (src.objectUrl) try { URL.revokeObjectURL(src.objectUrl); } catch (_) {}
  if (src.video) {
    try {
      src.video.pause();
      src.video.src = '';
      if (typeof src.video.remove === 'function') src.video.remove();
    } catch (_) {}
  }
  src._pcmAudio = null;
  if (typeof muteAllVideoFftTaps === 'function') muteAllVideoFftTaps();
  if (src.stream) try { src.stream.getTracks().forEach(t => t.stop()); } catch (_) {}

  state.sources.splice(idx, 1);

  const fallbackId = (state.sources[0] && state.sources[0].id) || 'src_shards';
  for (const s of state.surfaces) {
    if (s.sourceId === sourceId) s.sourceId = fallbackId;
  }
  const mixSrc = getMixbusSource();
  if (mixSrc && Array.isArray(mixSrc.orbs)) {
    for (const o of mixSrc.orbs) {
      if (o.sourceId === sourceId) o.sourceId = fallbackId;
    }
  }
  if (state.activeSourceId === sourceId) state.activeSourceId = fallbackId;
  if (state.shaderEditorSourceId === sourceId) {
    const nextIsf = state.sources.find(s => s.kind === 'isf');
    state.shaderEditorSourceId = nextIsf ? nextIsf.id : null;
  }

  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  state._pluginSyncRev = (state._pluginSyncRev || 0) + 1;
  if (typeof renderMediaBin === 'function') renderMediaBin();
  if (typeof renderSurfaceList === 'function') renderSurfaceList();
  if (typeof syncInspectorUI === 'function') syncInspectorUI();
  if (typeof syncTransportUI === 'function') syncTransportUI();
  if (typeof syncShaderStudioUI === 'function') syncShaderStudioUI();
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
  return true;
}

// ----------------------------------------------------------------------------
// 3. STACKABLE GPU POST-FX RACK & CUSTOM ISF EFFECT PLUGINS
// ----------------------------------------------------------------------------

function getFxDefinition(typeOrPluginId) {
  if (FX_REGISTRY[typeOrPluginId]) return FX_REGISTRY[typeOrPluginId];
  const custom = state.customFxPlugins.find(p => p.type === typeOrPluginId || p.id === typeOrPluginId);
  return custom || null;
}

function getAllFxDefinitions() {
  return [
    ...Object.values(FX_REGISTRY),
    ...state.customFxPlugins
  ];
}

function createFxInstance(typeOrPluginId, overrides = {}) {
  const def = getFxDefinition(typeOrPluginId);
  const type = def ? def.type : String(typeOrPluginId || 'bloom');
  const params = {};
  if (def && Array.isArray(def.params)) {
    for (const p of def.params) {
      const ov = overrides.params ? overrides.params[p.key] : undefined;
      params[p.key] = ov !== undefined ? ov : p.defaultVal;
    }
  } else if (overrides.params) {
    Object.assign(params, JSON.parse(JSON.stringify(overrides.params)));
  }

  return {
    id: overrides.id || `fx_${state.nextFxNum++}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    enabled: overrides.enabled !== false,
    collapsed: !!overrides.collapsed,
    params
  };
}

function cloneFxChain(chain) {
  if (!Array.isArray(chain)) return [];
  return chain.map(fx => ({
    id: fx.id || `fx_${state.nextFxNum++}_${Math.random().toString(36).slice(2, 6)}`,
    type: fx.type || 'bloom',
    enabled: fx.enabled !== false,
    collapsed: !!fx.collapsed,
    params: fx.params ? JSON.parse(JSON.stringify(fx.params)) : {}
  }));
}

function registerCustomFxPlugin(opts = {}) {
  const rawCode = String(opts.isfCode || ISF_STARTER_TEMPLATES.vhs_filter_fx.code);
  const id = sanitizeGlslIdentifier(opts.id || opts.type || `isf_fx_${state.customFxPlugins.length + 1}`);
  const type = id.startsWith('isf_fx_') ? id : `isf_fx_${id}`;

  let runtime = null;
  let meta = null;
  if (typeof compileIsfRuntimeSafe === 'function') {
    const res = compileIsfRuntimeSafe(rawCode);
    if (!res.ok) {
      return { ok: false, error: res.error };
    }
    runtime = res.runtime;
    meta = res.meta;
  } else {
    const parsed = transpileIsfToWebGL2(rawCode);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    meta = parsed.meta;
  }

  const paramDefs = (meta.inputs || [])
    .filter(inp => inp.type === 'float' || inp.type === 'bool' || inp.type === 'long')
    .map(inp => {
      if (inp.type === 'bool') {
        return {
          key: inp.name,
          label: inp.label,
          isfType: 'bool',
          min: 0,
          max: 1,
          step: 1,
          defaultVal: inp.defaultVal ? 1 : 0,
          fmt: v => (v >= 0.5 ? 'ON' : 'OFF')
        };
      }
      if (inp.type === 'long') {
        const minV = Math.min(...inp.values);
        const maxV = Math.max(...inp.values);
        return {
          key: inp.name,
          label: inp.label,
          isfType: 'long',
          min: minV,
          max: maxV,
          step: 1,
          defaultVal: inp.defaultVal,
          fmt: v => `${Math.round(v)}`
        };
      }
      return {
        key: inp.name,
        label: inp.label,
        isfType: 'float',
        min: inp.min,
        max: inp.max,
        step: Number(((inp.max - inp.min) / 100).toFixed(4)) || 0.01,
        defaultVal: (opts.defaultValues && opts.defaultValues[inp.name] !== undefined)
          ? Number(opts.defaultValues[inp.name])
          : inp.defaultVal,
        fmt: v => Number(v).toFixed(2)
      };
    });

  const pluginDef = {
    id: type,
    type,
    isCustomIsf: true,
    name: opts.name || meta.description || `Custom FX (${type})`,
    author: opts.author || meta.credit || 'Community',
    license: opts.license || APP_PLUGIN_DEFAULT_LICENSE,
    isfCode: rawCode,
    isfMeta: meta,
    _isfRuntime: runtime,
    params: paramDefs
  };

  const existingIdx = state.customFxPlugins.findIndex(p => p.type === type);
  if (existingIdx >= 0) {
    const prev = state.customFxPlugins[existingIdx];
    if (prev._isfRuntime && prev._isfRuntime.prog) {
      try { gl.deleteProgram(prev._isfRuntime.prog); } catch (_) {}
    }
    state.customFxPlugins[existingIdx] = pluginDef;
  } else {
    state.customFxPlugins.push(pluginDef);
  }

  state._pluginSyncRev = (state._pluginSyncRev || 0) + 1;
  if (typeof refreshFxSelectDropdowns === 'function') refreshFxSelectDropdowns();
  return { ok: true, plugin: pluginDef };
}

// ----------------------------------------------------------------------------
// 4. OPEN .wmplugin.json COMMUNITY PLUGIN FORMAT (IMPORT & EXPORT)
// ----------------------------------------------------------------------------

function serializeWmPluginObject(targetObj, kindOverride = null) {
  const isEffect = kindOverride === 'effect' || !!(targetObj.isfMeta && targetObj.isfMeta.isEffect);
  return {
    format: APP_PLUGIN_FORMAT,
    version: 1,
    kind: isEffect ? 'effect' : 'generator',
    id: sanitizeGlslIdentifier(targetObj.id || targetObj.name || 'custom_shader'),
    name: targetObj.name || 'Custom ISF Plugin',
    author: targetObj.author || (targetObj.isfMeta && targetObj.isfMeta.credit) || (APP_NAME + ' creator'),
    license: targetObj.license || APP_PLUGIN_DEFAULT_LICENSE,
    description: (targetObj.isfMeta && targetObj.isfMeta.description) || '',
    isfCode: targetObj.isfCode || '',
    defaultValues: targetObj.isfValues ? JSON.parse(JSON.stringify(targetObj.isfValues)) : {}
  };
}

function parseWmPluginJson(jsonText) {
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch (err) {
    return { ok: false, error: `Invalid JSON: ${err.message}` };
  }
  if (!data || typeof data !== 'object' || typeof data.isfCode !== 'string') {
    return { ok: false, error: 'Plugin JSON missing required "isfCode" string' };
  }
  return {
    ok: true,
    plugin: {
      format: APP_PLUGIN_FORMAT,
      version: Number(data.version || 1),
      kind: data.kind === 'effect' ? 'effect' : 'generator',
      id: sanitizeGlslIdentifier(data.id || data.name || 'wm_plugin'),
      name: String(data.name || 'Imported Plugin'),
      author: String(data.author || 'Community'),
      license: String(data.license || APP_PLUGIN_DEFAULT_LICENSE),
      isfCode: data.isfCode,
      defaultValues: data.defaultValues && typeof data.defaultValues === 'object' ? data.defaultValues : {}
    }
  };
}

function importIsfOrPluginFileText(rawText, fileName = 'shader.fs') {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) return { ok: false, error: 'Empty shader/plugin file' };

  const stem = String(fileName || 'shader').replace(/\.(wmplugin\.json|chaosplugin\.json|json|fs|isf|frag|glsl)$/i, '');

  // Case A: .wmplugin.json descriptor
  if (trimmed.startsWith('{')) {
    const parsed = parseWmPluginJson(trimmed);
    if (!parsed.ok) {
      if (typeof showToast === 'function') showToast(`Plugin Error: ${parsed.error}`);
      return parsed;
    }
    const p = parsed.plugin;
    if (p.kind === 'effect') {
      const reg = registerCustomFxPlugin(p);
      if (!reg.ok) {
        if (typeof showToast === 'function') showToast(`FX Compile Error: ${reg.error}`);
        return reg;
      }
      const surf = getSelectedSurface();
      if (surf) {
        if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Add FX Plugin', false);
        surf.fxChain.push(createFxInstance(reg.plugin.type));
        state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
        if (typeof syncInspectorUI === 'function') syncInspectorUI();
      }
      if (typeof showToast === 'function') showToast(`Installed FX Plugin: ${reg.plugin.name}`);
      return { ok: true, kind: 'effect', plugin: reg.plugin };
    }

    const src = addNewCustomIsfSource({
      name: p.name,
      author: p.author,
      license: p.license,
      isfCode: p.isfCode,
      isfValues: p.defaultValues
    }, true);
    if (typeof syncShaderStudioUI === 'function') syncShaderStudioUI();
    if (typeof showToast === 'function') showToast(`Loaded Generator Plugin: ${src.name}`);
    return { ok: true, kind: 'generator', source: src };
  }

  // Case B: Raw ISF v2 (.fs / .isf) or GLSL fragment file
  const probe = parseIsfSource(trimmed);
  if (probe.meta.isEffect) {
    const reg = registerCustomFxPlugin({
      id: stem,
      name: stem,
      isfCode: trimmed
    });
    if (!reg.ok) {
      if (typeof showToast === 'function') showToast(`ISF FX Error: ${reg.error}`);
      return reg;
    }
    const surf = getSelectedSurface();
    if (surf) {
      if (typeof pushUndoCheckpoint === 'function') pushUndoCheckpoint('Add ISF FX', false);
      surf.fxChain.push(createFxInstance(reg.plugin.type));
      state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
      if (typeof syncInspectorUI === 'function') syncInspectorUI();
    }
    if (typeof showToast === 'function') showToast(`Loaded ISF Filter FX: ${reg.plugin.name}`);
    return { ok: true, kind: 'effect', plugin: reg.plugin };
  }

  const src = addNewCustomIsfSource({
    name: stem,
    isfCode: trimmed
  }, true);
  if (typeof openShaderStudioDrawer === 'function') openShaderStudioDrawer(src.id);
  if (typeof showToast === 'function') {
    showToast(src.compileOk ? `Imported ISF Shader: ${src.name}` : `Imported ISF (Check Compiler Log): ${src.name}`);
  }
  return { ok: src.compileOk, kind: 'generator', source: src };
}

function downloadTextFile(text, filename, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function exportShaderAsFsFile(srcObj) {
  if (!srcObj || !srcObj.isfCode) return;
  const slug = sanitizeGlslIdentifier(srcObj.name || 'chaos_shader').toLowerCase();
  downloadTextFile(srcObj.isfCode, `${slug}.fs`, 'text/plain;charset=utf-8');
  showToast(`Exported ISF v2 Shader: ${slug}.fs`);
}

function exportShaderAsWmPluginFile(srcObj) {
  if (!srcObj || !srcObj.isfCode) return;
  const obj = serializeWmPluginObject(srcObj);
  const slug = sanitizeGlslIdentifier(srcObj.name || 'chaos_plugin').toLowerCase();
  downloadTextFile(JSON.stringify(obj, null, 2), `${slug}.chaosplugin.json`, 'application/json');
  showToast(`Exported plugin: ${slug}.chaosplugin.json`);
}
