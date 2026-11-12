// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
// ============================================================================
// 03c-capture-text-idb.js — Milestone 4: Browser Screen Capture (getDisplayMedia),
// Pro Video Trim/Waveform/BPM/Seamless-Loop, Dynamic Canvas Typography &
// IndexedDB FileSystemFileHandle 1-Click Reconnect + .wmshow.json Archive
// ============================================================================

// IME-safe Enter check (modern-web-guidance: ime-safe-enter-submit)
// Pairs event.isComposing with event.keyCode === 229 for Safari WebKit bug 165004
function isImeComposingEnter(event) {
  return Boolean(event && (event.isComposing || event.keyCode === 229));
}

let liveMeasuredFps = 60;

// ============================================================================
// 1. ZERO-INSTALL BROWSER WINDOW / SCREEN CAPTURE (getDisplayMedia) & PROJECTOR SHARE
// ============================================================================

function paintSyphonSlateTexture(tex, title, subtitle) {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 360;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#07111d';
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.strokeStyle = 'rgba(111, 211, 255, 0.65)';
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, c.width - 20, c.height - 20);

  ctx.fillStyle = '#6fd3ff';
  ctx.font = '700 18px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('🖥 WINDOW / SCREEN CAPTURE', c.width / 2, c.height / 2 - 18);

  ctx.fillStyle = '#ffffff';
  ctx.font = '600 16px sans-serif';
  ctx.fillText(String(title || 'Desktop Window / App Feed').slice(0, 44), c.width / 2, c.height / 2 + 12);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
  ctx.font = '12px monospace';
  ctx.fillText(subtitle || 'Click ↻ Re-Capture to select window, sketch, or tab', c.width / 2, c.height / 2 + 40);

  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
}

function createStoppedSyphonPlaceholder(entry = {}) {
  const width = entry.width || 1920;
  const height = entry.height || 1080;
  const texture = createGlTexture(640, 360);
  const name = entry.name || 'Screen Capture';
  paintSyphonSlateTexture(texture, name, 'Click ↻ Re-Capture to bind live window or tab');

  return {
    id: entry.id || `src_syphon_${state.nextSourceNum++}`,
    name,
    kind: 'syphon',
    displaySurface: entry.displaySurface || 'window',
    width,
    height,
    texture,
    video: null,
    stream: null,
    streamEnded: true,
    flipY: true,
    mirrorX: !!entry.mirrorX,
    offline: false,
    needsUpload: false,
    thumbUrl: entry.thumbUrl || null
  };
}

async function addScreenCaptureSource(targetSyphonSrc = null) {
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
    showToast('Screen / Window Capture (getDisplayMedia) is unavailable in this browser');
    return null;
  }

  try {
    const videoConstraints = {
      frameRate: { ideal: 60, max: 60 },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      cursor: 'never'
    };
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: videoConstraints,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          suppressLocalAudioPlayback: false
        },
        systemAudio: 'include'
      });
    } catch (firstErr) {
      if (firstErr && (firstErr.name === 'NotAllowedError' || firstErr.name === 'AbortError')) {
        throw firstErr;
      }
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: videoConstraints,
        audio: true
      });
    }

    if (targetSyphonSrc && targetSyphonSrc.stream) {
      try { targetSyphonSrc.stream.getTracks().forEach(t => t.stop()); } catch (_) {}
    }

    const track = stream.getVideoTracks()[0];
    const audioTracks = typeof stream.getAudioTracks === 'function' ? stream.getAudioTracks() : [];
    audioTracks.forEach(at => { at.enabled = true; });
    const hasAudioTrack = audioTracks.length > 0;
    const settings = (track && typeof track.getSettings === 'function') ? track.getSettings() : {};
    const rawLabel = (track && track.label) ? track.label.trim() : '';
    const surfaceKind = settings.displaySurface || 'window';
    const cleanName = rawLabel
      ? (/^(syphon|capture):/i.test(rawLabel) ? rawLabel : `Capture: ${rawLabel.slice(0, 34)}`)
      : (targetSyphonSrc ? targetSyphonSrc.name : `Capture ${surfaceKind} ${state.nextSourceNum}`);

    const video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    await video.play();

    let srcObj = targetSyphonSrc;
    if (!srcObj) {
      const id = `src_syphon_${state.nextSourceNum++}`;
      const texture = createGlTexture(16, 16);
      srcObj = {
        id,
        name: cleanName,
        kind: 'syphon',
        displaySurface: surfaceKind,
        hasAudioTrack,
        width: video.videoWidth || settings.width || 1920,
        height: video.videoHeight || settings.height || 1080,
        texture,
        video,
        stream,
        streamEnded: false,
        flipY: true,
        mirrorX: false,
        offline: false,
        needsUpload: true,
        thumbUrl: null
      };
      state.sources.push(srcObj);
    } else {
      srcObj.name = cleanName;
      srcObj.kind = 'syphon';
      srcObj.displaySurface = surfaceKind;
      srcObj.hasAudioTrack = hasAudioTrack;
      srcObj.video = video;
      srcObj.stream = stream;
      srcObj.streamEnded = false;
      srcObj.offline = false;
      srcObj.width = video.videoWidth || settings.width || srcObj.width || 1920;
      srcObj.height = video.videoHeight || settings.height || srcObj.height || 1080;
      srcObj.needsUpload = true;
    }

    const syncDimensions = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        srcObj.width = video.videoWidth;
        srcObj.height = video.videoHeight;
        srcObj.needsUpload = true;
        if (!srcObj.thumbUrl) {
          srcObj.thumbUrl = captureMediaThumb(video, srcObj.width, srcObj.height);
          if (typeof renderMediaBin === 'function') renderMediaBin();
        }
      }
    };
    video.addEventListener('loadedmetadata', syncDimensions);
    video.addEventListener('resize', syncDimensions);
    syncDimensions();

    const scheduleSyphonCallback = () => {
      if ('requestVideoFrameCallback' in video) {
        video.requestVideoFrameCallback(() => {
          if (srcObj.video !== video || srcObj.streamEnded) return;
          srcObj.needsUpload = true;
          if (!srcObj.thumbUrl && video.videoWidth > 0) {
            srcObj.thumbUrl = captureMediaThumb(video, video.videoWidth, video.videoHeight);
            if (typeof renderMediaBin === 'function') renderMediaBin();
          }
          scheduleSyphonCallback();
        });
      }
    };
    scheduleSyphonCallback();

    if (track && typeof track.addEventListener === 'function') {
      track.addEventListener('ended', () => {
        if (srcObj.stream !== stream) return;
        srcObj.streamEnded = true;
        srcObj.hasAudioTrack = false;
        paintSyphonSlateTexture(srcObj.texture, srcObj.name, 'Capture ended — click ↻ Re-Capture');
        state._pluginSyncRev = (state._pluginSyncRev || 0) + 1;
        if (typeof renderMediaBin === 'function') renderMediaBin();
        if (typeof syncTransportUI === 'function') syncTransportUI();
        if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
        showToast(`Capture stopped: ${srcObj.name}`);
      });
    }

    state._pluginSyncRev = (state._pluginSyncRev || 0) + 1;
    state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
    if (!targetSyphonSrc) {
      assignOrActivateNewSource(srcObj);
    } else {
      if (typeof renderMediaBin === 'function') renderMediaBin();
      if (typeof syncTransportUI === 'function') syncTransportUI();
    }
    if (state.audio && state.audio.enabled && state.audio.sourceMode === 'syphon' && typeof attachActiveSyphonToAudioGraph === 'function') {
      attachActiveSyphonToAudioGraph();
    }
    if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
    if (!state.isProjectorRole && typeof scheduleAutosave === 'function') {
      scheduleAutosave();
    }
    const audSuffix = hasAudioTrack ? ' + Audio Track Live' : ' (Video-only — check "Share Audio" for FFT)';
    showToast(`🖥 Screen capture live: ${srcObj.name} (${srcObj.width}×${srcObj.height})${audSuffix}`);
    return srcObj;
  } catch (err) {
    if (err && err.name === 'NotAllowedError') {
      showToast('Screen / Window capture cancelled');
    } else {
      showToast('Window capture unavailable in this context');
    }
    return null;
  }
}

// Expose live MediaStream getter so same-origin 2nd-Screen Projector popups mirror screen captures & camera at 60fps!
window._wmGetLiveMediaStream = function (srcId) {
  const s = state.sources.find(x => x.id === srcId && (x.kind === 'syphon' || x.kind === 'live'));
  if (!s || !s.stream || s.streamEnded) return null;
  return s.stream;
};

function reconcileProjectorLiveSources(liveList) {
  if (!state.isProjectorRole || !Array.isArray(liveList)) return;
  const openerGetter = (window.opener && !window.opener.closed && typeof window.opener._wmGetLiveMediaStream === 'function')
    ? window.opener._wmGetLiveMediaStream
    : null;

  for (const entry of liveList) {
    let local = state.sources.find(s => s.id === entry.id);
    const sharedStream = (entry.active && openerGetter) ? openerGetter(entry.id) : null;

    if (!local) {
      const texture = createGlTexture(16, 16);
      if (entry.kind === 'syphon') {
        paintSyphonSlateTexture(texture, entry.name, 'Waiting for live stream…');
      }
      local = {
        id: entry.id,
        name: entry.name || 'Live Feed',
        kind: entry.kind || 'syphon',
        width: entry.width || 1920,
        height: entry.height || 1080,
        texture,
        video: null,
        stream: null,
        streamEnded: !sharedStream,
        flipY: true,
        mirrorX: !!entry.mirrorX,
        offline: false,
        needsUpload: false
      };
      state.sources.push(local);
    }

    local.name = entry.name || local.name;
    local.mirrorX = !!entry.mirrorX;
    local.width = entry.width || local.width;
    local.height = entry.height || local.height;

    if (sharedStream && local.stream !== sharedStream) {
      const vid = document.createElement('video');
      vid.playsInline = true;
      vid.muted = true;
      vid.srcObject = sharedStream;
      vid.play().catch(() => {});
      local.video = vid;
      local.stream = sharedStream;
      local.streamEnded = false;
      local.needsUpload = true;
    } else if (!entry.active && !local.streamEnded) {
      local.streamEnded = true;
      local.stream = null;
      local.video = null;
      if (local.kind === 'syphon') {
        paintSyphonSlateTexture(local.texture, local.name, 'Capture paused on Controller');
      }
    }
  }
}

// ============================================================================
// 2. PRO VIDEO TRANSPORT: IN/OUT LOOP TRIM, FRAME-STEP, SEAMLESS XFADE LOOP,
//    BPM TEMPO SYNC & WEBAUDIO WAVEFORM SCRUBBER
// ============================================================================

function initProVideoProps(srcObj, meta = null) {
  if (!srcObj) return srcObj;
  srcObj.trimIn = clamp(Number(meta?.trimIn ?? srcObj.trimIn ?? 0.0), 0.0, 0.99);
  srcObj.trimOut = clamp(Number(meta?.trimOut ?? srcObj.trimOut ?? 1.0), 0.01, 1.0);
  if (srcObj.trimOut - srcObj.trimIn < 0.01) {
    srcObj.trimOut = clamp(srcObj.trimIn + 0.01, 0.01, 1.0);
    srcObj.trimIn = Math.min(srcObj.trimIn, srcObj.trimOut - 0.01);
  }
  srcObj.fps = clamp(Number(meta?.fps ?? srcObj.fps ?? 30), 12, 120);
  srcObj.seamlessLoop = !!(meta?.seamlessLoop ?? srcObj.seamlessLoop ?? false);
  srcObj.loopCrossfadeSec = clamp(Number(meta?.loopCrossfadeSec ?? srcObj.loopCrossfadeSec ?? 0.40), 0.08, 1.5);
  srcObj.bpmSync = !!(meta?.bpmSync ?? srcObj.bpmSync ?? false);
  srcObj.clipBpm = clamp(Number(meta?.clipBpm ?? srcObj.clipBpm ?? 120), 30, 300);
  srcObj.targetBpm = clamp(Number(meta?.targetBpm ?? srcObj.targetBpm ?? 120), 30, 300);
  if (!srcObj.waveformPeaks) srcObj.waveformPeaks = null;
  srcObj._tapTimes = [];
  srcObj._loopXfadeActive = false;
  srcObj._loopXfadeElapsed = 0;
  return srcObj;
}

function normalizeVideoTrim(srcObj, changedEdge = 'in') {
  if (!srcObj) return;
  let tIn = clamp(Number(srcObj.trimIn ?? 0), 0, 0.99);
  let tOut = clamp(Number(srcObj.trimOut ?? 1), 0.01, 1);
  if (tOut - tIn < 0.01) {
    if (changedEdge === 'in') tIn = Math.max(0, tOut - 0.01);
    else tOut = Math.min(1, tIn + 0.01);
  }
  srcObj.trimIn = Number(tIn.toFixed(4));
  srcObj.trimOut = Number(tOut.toFixed(4));
  if (srcObj.video) {
    const isFullTrim = srcObj.trimIn <= 0.001 && srcObj.trimOut >= 0.999 && !srcObj.seamlessLoop;
    srcObj.video.loop = (srcObj.loopMode === 'loop' && isFullTrim);
  }
}

function stepVideoFrame(srcObj, dir = 1) {
  if (!srcObj || srcObj.kind !== 'video' || srcObj.offline || !srcObj.video) return;
  const vid = srcObj.video;
  const dur = vid.duration || 0;
  if (dur <= 0) return;

  srcObj.playing = false;
  if (!vid.paused) vid.pause();

  const stepSec = (1 / Math.max(12, srcObj.fps || 30)) * (dir >= 0 ? 1 : -1);
  const minT = (srcObj.trimIn ?? 0) * dur;
  const maxT = (srcObj.trimOut ?? 1) * dur;
  vid.currentTime = clamp((vid.currentTime || 0) + stepSec, minT, Math.max(minT, maxT - 0.001));
  srcObj.needsUpload = true;
  if (typeof syncTransportUI === 'function') syncTransportUI();
}

function applyVideoBpmRate(srcObj) {
  if (!srcObj || srcObj.kind !== 'video') return;
  if (srcObj.bpmSync) {
    const base = Math.max(30, Number(srcObj.clipBpm) || 120);
    const target = clamp(Number(srcObj.targetBpm) || 120, 30, 300);
    srcObj.rate = Number(clamp(target / base, 0.1, 4.0).toFixed(3));
    if (srcObj.video) srcObj.video.playbackRate = srcObj.rate;
  }
}

function registerVideoTapTempo(srcObj) {
  if (!srcObj || srcObj.kind !== 'video') return null;
  const now = performance.now();
  if (!Array.isArray(srcObj._tapTimes)) srcObj._tapTimes = [];
  if (srcObj._tapTimes.length > 0 && (now - srcObj._tapTimes[srcObj._tapTimes.length - 1]) > 2200) {
    srcObj._tapTimes = [];
  }
  srcObj._tapTimes.push(now);
  if (srcObj._tapTimes.length > 6) srcObj._tapTimes.shift();
  if (srcObj._tapTimes.length < 2) return null;

  let sum = 0;
  for (let i = 1; i < srcObj._tapTimes.length; i++) {
    sum += (srcObj._tapTimes[i] - srcObj._tapTimes[i - 1]);
  }
  const avgMs = sum / (srcObj._tapTimes.length - 1);
  const bpm = clamp(Math.round(60000 / Math.max(180, avgMs)), 40, 240);
  srcObj.targetBpm = bpm;
  srcObj.bpmSync = true;
  applyVideoBpmRate(srcObj);
  return bpm;
}

// Lazy GPU helper program & FBOs for zero-decoder-lag Seamless Loop Crossfade
let progVideoLoopBlend = null;
const FS_VIDEO_LOOP_BLEND = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uHoldTex;
uniform sampler2D uLiveTex;
uniform float uMix;
void main() {
  vec4 a = texture(uHoldTex, vUv);
  vec4 b = texture(uLiveTex, vUv);
  float m = smoothstep(0.0, 1.0, clamp(uMix, 0.0, 1.0));
  fragColor = mix(a, b, m);
}
`;

function ensureVideoLoopBlendResources(srcObj, w, h) {
  if (!progVideoLoopBlend) {
    progVideoLoopBlend = createProgram(FULLSCREEN_VS, FS_VIDEO_LOOP_BLEND, ['uHoldTex', 'uLiveTex', 'uMix']);
  }
  if (!srcObj._loopHoldFbo) {
    srcObj._loopHoldFbo = createDynamicFbo();
    srcObj._loopLiveTex = createGlTexture(w, h);
    srcObj._loopOutFbo = gl.createFramebuffer();
  }
  resizeFboIfNeeded(srcObj._loopHoldFbo, w, h, false);
}

function snapshotVideoLoopHoldFrame(srcObj) {
  if (!srcObj || !srcObj.texture) return;
  const w = clamp(Math.round(srcObj.width || 1920), 64, 3840);
  const h = clamp(Math.round(srcObj.height || 1080), 64, 2160);
  ensureVideoLoopBlendResources(srcObj, w, h);

  // Copy current outgoing frame (srcObj.texture) into _loopHoldFbo
  gl.bindFramebuffer(gl.FRAMEBUFFER, srcObj._loopHoldFbo.fbo);
  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.BLEND);
  gl.viewport(0, 0, srcObj._loopHoldFbo.w, srcObj._loopHoldFbo.h);
  gl.bindVertexArray(emptyVao);
  gl.useProgram(progVideoLoopBlend.prog);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, srcObj.texture);
  gl.uniform1i(progVideoLoopBlend.u.uHoldTex, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, srcObj.texture);
  gl.uniform1i(progVideoLoopBlend.u.uLiveTex, 1);
  gl.uniform1f(progVideoLoopBlend.u.uMix, 0.0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  srcObj._loopXfadeActive = true;
  srcObj._loopXfadeElapsed = 0;
}

function updateProVideoSource(srcObj, dt, skipGpu, isNeeded) {
  const vid = srcObj.video;
  if (!vid || vid.readyState < 2) return;

  const dur = vid.duration || 0;
  const tIn = clamp(srcObj.trimIn ?? 0, 0, 0.99);
  const tOut = clamp(srcObj.trimOut ?? 1, tIn + 0.01, 1);
  const inSec = dur * tIn;
  const outSec = dur * tOut;
  const hasCustomBounds = (tIn > 0.001 || tOut < 0.999 || !!srcObj.seamlessLoop);

  if (dur > 0.1 && srcObj.playing && !state.isProjectorRole) {
    if (srcObj.loopMode === 'pingpong') {
      if (vid.loop) vid.loop = false;
      if (srcObj.pingPongDir === 1) {
        if (vid.paused) vid.play().catch(() => {});
        if (vid.currentTime >= outSec - 0.035) {
          srcObj.pingPongDir = -1;
          vid.pause();
        } else if (vid.currentTime < inSec - 0.05) {
          vid.currentTime = inSec;
        }
      } else {
        if (!vid.paused) vid.pause();
        if (!srcObj.isSeekingReverse) {
          const nextT = vid.currentTime - dt * (srcObj.rate || 1.0);
          if (nextT <= inSec + 0.03) {
            srcObj.pingPongDir = 1;
            vid.currentTime = inSec;
            vid.play().catch(() => {});
          } else {
            srcObj.isSeekingReverse = true;
            vid.currentTime = nextT;
          }
        }
      }
    } else if (srcObj.loopMode === 'oneshot') {
      if (vid.loop) vid.loop = false;
      if (vid.currentTime >= outSec - 0.025) {
        vid.pause();
        vid.currentTime = Math.max(inSec, outSec - 0.01);
        srcObj.playing = false;
        srcObj.needsUpload = true;
        if (typeof syncTransportUI === 'function') syncTransportUI();
      }
    } else {
      // loopMode === 'loop'
      if (hasCustomBounds) {
        if (vid.loop) vid.loop = false;
        const wrapMargin = srcObj.seamlessLoop ? 0.045 : 0.025;
        if (vid.currentTime >= outSec - wrapMargin || vid.ended) {
          if (srcObj.seamlessLoop && !skipGpu && (outSec - inSec) > 0.25) {
            snapshotVideoLoopHoldFrame(srcObj);
          }
          vid.currentTime = inSec;
          if (vid.paused) vid.play().catch(() => {});
          srcObj.needsUpload = true;
        } else if (vid.currentTime < inSec - 0.06) {
          vid.currentTime = inSec;
          srcObj.needsUpload = true;
        }
      } else if (!vid.loop) {
        vid.loop = true;
      }
      if (vid.paused && !vid.ended) {
        const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (!srcObj._lastPlayRetryMs || (nowMs - srcObj._lastPlayRetryMs) > 1200) {
          srcObj._lastPlayRetryMs = nowMs;
          vid.play().catch(() => {});
        }
      }
    }
    if (srcObj.hasAudioTrack !== true) {
      if (
        vid.mozHasAudio === true ||
        (vid.audioTracks && vid.audioTracks.length > 0) ||
        (typeof vid.webkitAudioDecodedByteCount === 'number' && vid.webkitAudioDecodedByteCount > 0)
      ) {
        srcObj.hasAudioTrack = true;
      }
    }
  }

  if (srcObj._loopXfadeActive) {
    const fadeDur = clamp(Math.min(srcObj.loopCrossfadeSec || 0.40, Math.max(0.12, (outSec - inSec) * 0.4)), 0.08, 1.5);
    srcObj._loopXfadeElapsed += dt;
    if (srcObj._loopXfadeElapsed >= fadeDur) {
      srcObj._loopXfadeActive = false;
      srcObj.needsUpload = true;
    }
  }

  if (skipGpu || !isNeeded) return;

  const frameMoved = srcObj.needsUpload || Math.abs(vid.currentTime - srcObj.lastUploadedTime) > 0.004;
  if (!frameMoved && !srcObj._loopXfadeActive) return;

  if (srcObj._loopXfadeActive && srcObj._loopHoldFbo) {
    const w = vid.videoWidth || srcObj.width || 1920;
    const h = vid.videoHeight || srcObj.height || 1080;
    ensureVideoLoopBlendResources(srcObj, w, h);

    gl.bindTexture(gl.TEXTURE_2D, srcObj._loopLiveTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, vid);

    // Ensure srcObj.texture matches video dimensions before attaching to FBO
    if (srcObj._texAllocW !== w || srcObj._texAllocH !== h) {
      gl.bindTexture(gl.TEXTURE_2D, srcObj.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      srcObj._texAllocW = w;
      srcObj._texAllocH = h;
    }

    const fadeDur = clamp(Math.min(srcObj.loopCrossfadeSec || 0.40, Math.max(0.12, (outSec - inSec) * 0.4)), 0.08, 1.5);
    const mixT = clamp(srcObj._loopXfadeElapsed / fadeDur, 0, 1);

    gl.bindFramebuffer(gl.FRAMEBUFFER, srcObj._loopOutFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, srcObj.texture, 0);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, w, h);
    gl.bindVertexArray(emptyVao);
    gl.useProgram(progVideoLoopBlend.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcObj._loopHoldFbo.tex);
    gl.uniform1i(progVideoLoopBlend.u.uHoldTex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, srcObj._loopLiveTex);
    gl.uniform1i(progVideoLoopBlend.u.uLiveTex, 1);
    gl.uniform1f(progVideoLoopBlend.u.uMix, mixT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    srcObj.lastUploadedTime = vid.currentTime;
    srcObj.needsUpload = false;
  } else {
    gl.bindTexture(gl.TEXTURE_2D, srcObj.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, vid);
    srcObj._texAllocW = vid.videoWidth || srcObj.width;
    srcObj._texAllocH = vid.videoHeight || srcObj.height;
    srcObj.lastUploadedTime = vid.currentTime;
    srcObj.needsUpload = false;
  }
}

let sharedWaveformAudioCtx = null;
function createOfflineDecodeCtx() {
  const OffCtor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (OffCtor) {
    try {
      return new OffCtor(2, 44100, 44100);
    } catch (_) {}
  }
  if (sharedWaveformAudioCtx) return sharedWaveformAudioCtx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    sharedWaveformAudioCtx = new Ctor();
    return sharedWaveformAudioCtx;
  } catch (_) {
    return null;
  }
}

async function extractVideoWaveformPeaks(srcObj, file, bucketCount = 136) {
  if (!srcObj || !file || state.isProjectorRole) return;
  // Cap RAM PCM decode at 250 MB so multi-gigabyte ProRes/HAP exports never spike browser memory
  // (live captureStream() still feeds WebAudio FFT for >250 MB files!)
  if (!file.size || file.size > 250 * 1024 * 1024 || typeof file.arrayBuffer !== 'function') {
    srcObj.waveformSilent = true;
    renderVideoWaveformCanvas(srcObj);
    return;
  }
  const actx = createOfflineDecodeCtx();
  if (!actx) {
    srcObj.waveformSilent = true;
    renderVideoWaveformCanvas(srcObj);
    return;
  }
  try {
    const rawBuf = await file.arrayBuffer();
    const audioBuf = await actx.decodeAudioData(rawBuf.slice(0));
    if (!audioBuf || audioBuf.numberOfChannels < 1 || !audioBuf.length) {
      srcObj.hasAudioTrack = false;
      srcObj._pcmAudio = null;
      srcObj.waveformSilent = true;
      renderVideoWaveformCanvas(srcObj);
      if (state.inspTab === 'mod' && typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
      return;
    }
    const ch0 = audioBuf.getChannelData(0);
    const ch1 = audioBuf.numberOfChannels > 1 ? audioBuf.getChannelData(1) : null;
    const total = ch0.length;

    // Preserve decoded PCM channels in JS memory so WebAudio FFT & Beat Engine work 100% over
    // offline file:// (avoiding MediaElementAudioSourceNode opaque-origin speaker muting & zeroing!)
    const pcmChannels = [new Float32Array(ch0)];
    if (ch1) pcmChannels.push(new Float32Array(ch1));
    srcObj._pcmAudio = {
      sampleRate: audioBuf.sampleRate,
      duration: audioBuf.duration,
      length: total,
      channels: pcmChannels
    };
    srcObj.hasAudioTrack = true;

    const peaks = new Float32Array(bucketCount);
    const step = Math.max(1, Math.floor(total / bucketCount));
    const stride = Math.max(1, Math.floor(step / 64));
    let rawMaxPeak = 0;

    for (let b = 0; b < bucketCount; b++) {
      const start = b * step;
      const end = Math.min(total, start + step);
      let peak = 0;
      for (let i = start; i < end; i += stride) {
        const s0 = Math.abs(ch0[i]);
        const s1 = ch1 ? Math.abs(ch1[i]) : s0;
        const m = (s0 + s1) * 0.5;
        if (m > peak) peak = m;
      }
      peaks[b] = peak;
      if (peak > rawMaxPeak) rawMaxPeak = peak;
    }

    srcObj.audioTrackSilent = rawMaxPeak < 1e-4;
    const normDiv = Math.max(0.001, rawMaxPeak);
    for (let b = 0; b < bucketCount; b++) {
      peaks[b] = clamp(Math.pow(peaks[b] / normDiv, 0.75), 0.04, 1.0);
    }
    srcObj.waveformPeaks = peaks;
    srcObj.waveformSilent = srcObj.audioTrackSilent;
    if (state.activeSourceId === srcObj.id) {
      renderVideoWaveformCanvas(srcObj);
    }
    if (state.audio && state.audio.enabled && state.audio.sourceMode === 'video' && typeof attachActiveVideoToAudioGraph === 'function') {
      attachActiveVideoToAudioGraph();
    }
    if (state.inspTab === 'mod' && typeof syncModIoInspectorUI === 'function') {
      syncModIoInspectorUI();
    }
  } catch (_) {
    // Container codec may still be playable by <video> (e.g. .mov / ProRes / AC3) even if WebAudio decodeAudioData rejects!
    const vid = srcObj.video;
    const browserSeesAudio = !!(vid && (
      vid.mozHasAudio === true ||
      (vid.audioTracks && vid.audioTracks.length > 0) ||
      (typeof vid.webkitAudioDecodedByteCount === 'number' && vid.webkitAudioDecodedByteCount > 0)
    ));
    // Only mark false once <video> has decoded >0.35s of frames with zero audio bytes; otherwise keep null so captureStream() / playback check can confirm
    const playedEnoughToKnow = !!(vid && vid.readyState >= 2 && vid.currentTime > 0.35 && typeof vid.webkitAudioDecodedByteCount === 'number');
    srcObj.hasAudioTrack = browserSeesAudio ? true : (playedEnoughToKnow ? false : null);
    srcObj._pcmAudio = null;
    srcObj.waveformSilent = true;
    if (state.activeSourceId === srcObj.id) {
      renderVideoWaveformCanvas(srcObj);
    }
    if (state.audio && state.audio.enabled && state.audio.sourceMode === 'video' && typeof attachActiveVideoToAudioGraph === 'function') {
      attachActiveVideoToAudioGraph();
    }
    if (state.inspTab === 'mod' && typeof syncModIoInspectorUI === 'function') {
      syncModIoInspectorUI();
    }
  }
}

function renderVideoWaveformCanvas(srcObj) {
  const cvs = document.getElementById('vid-waveform-canvas');
  if (!cvs) return;
  const ctx = cvs.getContext('2d');
  if (!ctx) return;

  const w = cvs.width || 260;
  const h = cvs.height || 22;
  ctx.clearRect(0, 0, w, h);

  if (!srcObj || srcObj.kind !== 'video') return;
  const tIn = clamp(srcObj.trimIn ?? 0, 0, 0.99);
  const tOut = clamp(srcObj.trimOut ?? 1, tIn + 0.01, 1);
  const xIn = Math.round(tIn * w);
  const xOut = Math.round(tOut * w);

  // Active loop region backdrop
  ctx.fillStyle = 'rgba(52, 232, 158, 0.09)';
  ctx.fillRect(xIn, 0, Math.max(2, xOut - xIn), h);

  // Dimmed trimmed-out regions
  if (xIn > 0) {
    ctx.fillStyle = 'rgba(4, 6, 10, 0.65)';
    ctx.fillRect(0, 0, xIn, h);
  }
  if (xOut < w) {
    ctx.fillStyle = 'rgba(4, 6, 10, 0.65)';
    ctx.fillRect(xOut, 0, w - xOut, h);
  }

  const peaks = srcObj.waveformPeaks;
  if (peaks && peaks.length > 0) {
    const n = peaks.length;
    const barW = Math.max(1, (w / n) - 0.8);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const inside = u >= tIn && u <= tOut;
      const bh = Math.max(2, peaks[i] * (h - 4));
      const bx = (i / n) * w;
      const by = (h - bh) * 0.5;
      ctx.fillStyle = inside ? 'rgba(111, 211, 255, 0.62)' : 'rgba(143, 155, 179, 0.22)';
      ctx.fillRect(bx, by, barW, bh);
    }
  } else {
    // Subtle ruler ticks for silent video clips
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      const x = Math.round(u * (w - 1)) + 0.5;
      const major = i % 4 === 0;
      const th = major ? h * 0.48 : h * 0.24;
      ctx.fillStyle = (u >= tIn && u <= tOut)
        ? 'rgba(111, 211, 255, 0.34)'
        : 'rgba(143, 155, 179, 0.16)';
      ctx.fillRect(x, (h - th) * 0.5, 1, th);
    }
  }

  // Crisp In / Out trim bracket markers
  if (tIn > 0.001 || tOut < 0.999) {
    ctx.fillStyle = '#34e89e';
    ctx.fillRect(xIn, 0, 2, h);
    ctx.fillRect(xIn, 0, 5, 2);
    ctx.fillRect(xIn, h - 2, 5, 2);

    ctx.fillStyle = '#ffcb7d';
    ctx.fillRect(Math.max(0, xOut - 2), 0, 2, h);
    ctx.fillRect(Math.max(0, xOut - 5), 0, 5, 2);
    ctx.fillRect(Math.max(0, xOut - 5), h - 2, 5, 2);
  }
}

// ============================================================================
// 3. DYNAMIC CANVAS TYPOGRAPHY / CLOCK / COUNTDOWN GENERATOR (kind: 'text')
// ============================================================================

const TEXT_FONT_STACKS = {
  sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  mono: '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, Consolas, monospace',
  serif: '"Iowan Old Style", Georgia, "Times New Roman", serif',
  display: '"Arial Black", "Helvetica Neue", Impact, sans-serif',
  condensed: '"Avenir Next Condensed", "Arial Narrow", Impact, sans-serif'
};

// Event differential formatter using Temporal + Intl.DurationFormat when available
// (modern-web-guidance: calculate-event-differentials) with zero-dep offline fallback
function formatCountdownToken(targetEpochMs, nowEpochMs, doneText = '00:00:00') {
  const targetMs = Math.round(Number(targetEpochMs) || 0);
  const nowMs = Math.round(Number(nowEpochMs) || Date.now());

  try {
    if (typeof Temporal !== 'undefined' && Temporal.Instant && Temporal.Now) {
      const tz = Temporal.Now.timeZoneId();
      const nowZdt = Temporal.Instant.fromEpochMilliseconds(nowMs).toZonedDateTimeISO(tz);
      const endZdt = Temporal.Instant.fromEpochMilliseconds(targetMs).toZonedDateTimeISO(tz);
      const timeRemaining = nowZdt.until(endZdt, { largestUnit: 'hour', smallestUnit: 'second' });
      if (timeRemaining.sign <= 0) {
        return doneText || '00:00:00';
      }
      if (typeof Intl !== 'undefined' && typeof Intl.DurationFormat === 'function') {
        return new Intl.DurationFormat(undefined, {
          style: 'digital',
          hoursDisplay: 'always'
        }).format(timeRemaining);
      }
      return timeRemaining.toLocaleString(undefined, { style: 'digital' });
    }
  } catch (_) {
    // Fall through to zero-dependency offline Intl.DurationFormat path
  }

  const remSec = Math.ceil((targetMs - nowMs) / 1000);
  if (remSec <= 0) return doneText || '00:00:00';

  const hours = Math.floor(remSec / 3600);
  const minutes = Math.floor((remSec % 3600) / 60);
  const seconds = remSec % 60;

  try {
    if (typeof Intl !== 'undefined' && typeof Intl.DurationFormat === 'function') {
      return new Intl.DurationFormat(undefined, {
        style: 'digital',
        hoursDisplay: 'always'
      }).format({ hours, minutes, seconds });
    }
  } catch (_) {}

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function resolveDynamicTextTokens(templateStr, srcObj, nowEpochMs = Date.now()) {
  const raw = String(templateStr ?? '');
  if (!raw.includes('{')) return raw;

  const nowDate = new Date(nowEpochMs);
  return raw
    .replace(/\{TIME24\}/gi, () => {
      try {
        return new Intl.DateTimeFormat(undefined, {
          hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
        }).format(nowDate);
      } catch (_) {
        return nowDate.toTimeString().slice(0, 8);
      }
    })
    .replace(/\{TIME\}/gi, () => {
      try {
        return new Intl.DateTimeFormat(undefined, {
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
        }).format(nowDate);
      } catch (_) {
        return nowDate.toLocaleTimeString();
      }
    })
    .replace(/\{DATE\}/gi, () => {
      try {
        return new Intl.DateTimeFormat(undefined, {
          year: 'numeric', month: 'short', day: '2-digit'
        }).format(nowDate);
      } catch (_) {
        return nowDate.toISOString().slice(0, 10);
      }
    })
    .replace(/\{COUNTDOWN\}/gi, () =>
      formatCountdownToken(srcObj?.countdownTargetMs, nowEpochMs, srcObj?.countdownDoneText)
    )
    .replace(/\{FPS\}/gi, () => `${Math.round(liveMeasuredFps || 60)} FPS`);
}

function createTextSource(opts = {}) {
  const width = clamp(Math.round(opts.width || 1920), 256, 3840);
  const height = clamp(Math.round(opts.height || 1080), 256, 2160);
  const texture = createGlTexture(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const cdMins = clamp(Number(opts.countdownMinutes ?? 10), 0.1, 1440);
  const id = opts.id || `src_txt_${state.nextSourceNum++}`;
  const srcObj = {
    id,
    name: opts.name || `Stage Text ${state.nextSourceNum - 1}`,
    kind: 'text',
    width,
    height,
    texture,
    canvas,
    ctx,
    flipY: true,
    mirrorX: !!opts.mirrorX,
    offline: false,
    playing: opts.playing !== false,
    simTime: Number(opts.simTime || 0),
    text: opts.text ?? 'CHAOS CATHODERAY\n{TIME24}',
    fontFamily: opts.fontFamily || 'sans',
    fontWeight: String(opts.fontWeight || '800'),
    fontSize: clamp(Number(opts.fontSize ?? 136), 20, 420),
    letterSpacing: clamp(Number(opts.letterSpacing ?? 4), -10, 80),
    lineHeight: clamp(Number(opts.lineHeight ?? 1.18), 0.75, 2.5),
    align: opts.align || 'center',
    fgColor: opts.fgColor || '#ffffff',
    bgColor: opts.bgColor || '#070b14',
    bgOpacity: clamp(Number(opts.bgOpacity ?? 0.0), 0, 1),
    strokeColor: opts.strokeColor || '#6fd3ff',
    strokeWidth: clamp(Number(opts.strokeWidth ?? 0), 0, 32),
    glowColor: opts.glowColor || '#6fd3ff',
    glowBlur: clamp(Number(opts.glowBlur ?? 20), 0, 80),
    paddingX: clamp(Number(opts.paddingX ?? 96), 0, 360),
    animMode: opts.animMode || 'static',
    animSpeed: clamp(Number(opts.animSpeed ?? 1.0), 0, 5),
    countdownMinutes: cdMins,
    countdownTargetMs: Number(opts.countdownTargetMs) || (Date.now() + cdMins * 60 * 1000),
    countdownDoneText: opts.countdownDoneText ?? 'LIVE NOW',
    thumbUrl: opts.thumbUrl || null,
    _textDirty: true,
    _thumbDirty: true,
    _lastRenderedText: null,
    swatchCss: 'linear-gradient(135deg, #0d1b2a, #6fd3ff, #ffcb7d)'
  };

  renderTextSourceCanvas(srcObj, 0, true);
  return srcObj;
}

function addNewTextSource(opts = {}, activateNow = true) {
  const srcObj = createTextSource(opts);
  const existingIdx = state.sources.findIndex(s => s.id === srcObj.id);
  if (existingIdx >= 0) {
    const old = state.sources[existingIdx];
    if (old.texture) try { gl.deleteTexture(old.texture); } catch (_) {}
    state.sources[existingIdx] = srcObj;
  } else {
    state.sources.push(srcObj);
  }
  state._pluginSyncRev = (state._pluginSyncRev || 0) + 1;
  state._sceneSyncRev = (state._sceneSyncRev || 0) + 1;
  if (activateNow && !state.isProjectorRole) {
    assignOrActivateNewSource(srcObj);
  } else {
    if (typeof renderMediaBin === 'function') renderMediaBin();
    if (typeof syncInspectorUI === 'function') syncInspectorUI();
  }
  return srcObj;
}

function serializeTextSource(s) {
  return {
    id: s.id,
    name: s.name,
    kind: 'text',
    width: s.width || 1920,
    height: s.height || 1080,
    mirrorX: !!s.mirrorX,
    playing: s.playing !== false,
    simTime: s.simTime || 0,
    text: s.text,
    fontFamily: s.fontFamily || 'sans',
    fontWeight: s.fontWeight || '800',
    fontSize: s.fontSize ?? 136,
    letterSpacing: s.letterSpacing ?? 4,
    lineHeight: s.lineHeight ?? 1.18,
    align: s.align || 'center',
    fgColor: s.fgColor || '#ffffff',
    bgColor: s.bgColor || '#070b14',
    bgOpacity: s.bgOpacity ?? 0.0,
    strokeColor: s.strokeColor || '#6fd3ff',
    strokeWidth: s.strokeWidth ?? 0,
    glowColor: s.glowColor || '#6fd3ff',
    glowBlur: s.glowBlur ?? 20,
    paddingX: s.paddingX ?? 96,
    animMode: s.animMode || 'static',
    animSpeed: s.animSpeed ?? 1.0,
    countdownMinutes: s.countdownMinutes ?? 10,
    countdownTargetMs: s.countdownTargetMs || Date.now(),
    countdownDoneText: s.countdownDoneText ?? 'LIVE NOW'
  };
}

function applyTextSourceProps(srcObj, incoming) {
  if (!srcObj || !incoming) return;
  const fields = [
    'name', 'text', 'fontFamily', 'fontWeight', 'fontSize', 'letterSpacing',
    'lineHeight', 'align', 'fgColor', 'bgColor', 'bgOpacity', 'strokeColor',
    'strokeWidth', 'glowColor', 'glowBlur', 'paddingX', 'animMode', 'animSpeed',
    'countdownMinutes', 'countdownTargetMs', 'countdownDoneText'
  ];
  let changed = false;
  for (const k of fields) {
    if (incoming[k] !== undefined && srcObj[k] !== incoming[k]) {
      srcObj[k] = incoming[k];
      changed = true;
    }
  }
  srcObj.mirrorX = !!incoming.mirrorX;
  if (typeof incoming.simTime === 'number') srcObj.simTime = incoming.simTime;
  if (changed) {
    srcObj._textDirty = true;
    srcObj._thumbDirty = true;
  }
}

function drawTrackedTextLine(ctx, line, x, y, trackingPx, align, doStroke) {
  if (!line) return;
  if ('letterSpacing' in ctx) {
    ctx.textAlign = align;
    ctx.letterSpacing = `${trackingPx}px`;
    if (doStroke) ctx.strokeText(line, x, y);
    ctx.fillText(line, x, y);
    return;
  }
  if (Math.abs(trackingPx) < 0.25) {
    ctx.textAlign = align;
    if (doStroke) ctx.strokeText(line, x, y);
    ctx.fillText(line, x, y);
    return;
  }
  const chars = Array.from(line);
  const widths = chars.map(ch => ctx.measureText(ch).width);
  const totalW = widths.reduce((a, b) => a + b, 0) + Math.max(0, chars.length - 1) * trackingPx;
  let curX = align === 'center' ? (x - totalW * 0.5) : (align === 'right' ? (x - totalW) : x);
  ctx.textAlign = 'left';
  for (let i = 0; i < chars.length; i++) {
    if (doStroke) ctx.strokeText(chars[i], curX, y);
    ctx.fillText(chars[i], curX, y);
    curX += widths[i] + trackingPx;
  }
}

function renderTextSourceCanvas(srcObj, dt = 0, forceUpload = false) {
  if (!srcObj || srcObj.kind !== 'text' || !srcObj.ctx || !srcObj.canvas) return;
  if (srcObj.playing && !state.isProjectorRole) {
    srcObj.simTime += dt * (srcObj.animSpeed ?? 1.0);
  }

  const nowMs = Date.now();
  const resolved = resolveDynamicTextTokens(srcObj.text, srcObj, nowMs);
  const anim = srcObj.animMode || 'static';
  const isAnimated = anim !== 'static';

  if (!forceUpload && !isAnimated && !srcObj._textDirty && resolved === srcObj._lastRenderedText) {
    return;
  }

  const ctx = srcObj.ctx;
  const w = srcObj.width || 1920;
  const h = srcObj.height || 1080;
  if (srcObj.canvas.width !== w) srcObj.canvas.width = w;
  if (srcObj.canvas.height !== h) srcObj.canvas.height = h;

  ctx.save();
  ctx.clearRect(0, 0, w, h);

  const bgAlpha = clamp(Number(srcObj.bgOpacity ?? 0), 0, 1);
  if (bgAlpha > 0.002) {
    const rgb = hexToRgbNorm(srcObj.bgColor || '#070b14');
    ctx.fillStyle = `rgba(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)}, ${bgAlpha})`;
    ctx.fillRect(0, 0, w, h);
  }

  const fontStack = TEXT_FONT_STACKS[srcObj.fontFamily] || TEXT_FONT_STACKS.sans;
  let fSize = clamp(Number(srcObj.fontSize ?? 136), 20, 420);
  let alphaMul = 1.0;

  if (anim === 'pulse') {
    const wave = 0.5 + 0.5 * Math.sin(srcObj.simTime * 3.2);
    fSize *= (0.94 + 0.10 * wave);
    alphaMul = 0.68 + 0.32 * wave;
  }

  ctx.font = `${srcObj.fontWeight || '800'} ${Math.round(fSize)}px ${fontStack}`;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  const fgRgb = hexToRgbNorm(srcObj.fgColor || '#ffffff');
  ctx.fillStyle = `rgba(${Math.round(fgRgb[0] * 255)}, ${Math.round(fgRgb[1] * 255)}, ${Math.round(fgRgb[2] * 255)}, ${alphaMul})`;

  const strokeW = clamp(Number(srcObj.strokeWidth ?? 0), 0, 32);
  if (strokeW > 0.2) {
    ctx.lineWidth = strokeW * 2;
    ctx.strokeStyle = srcObj.strokeColor || '#6fd3ff';
  }

  const glow = clamp(Number(srcObj.glowBlur ?? 0), 0, 80);
  if (glow > 0.5) {
    ctx.shadowColor = srcObj.glowColor || srcObj.fgColor || '#6fd3ff';
    ctx.shadowBlur = glow;
  } else {
    ctx.shadowBlur = 0;
  }

  const tracking = clamp(Number(srcObj.letterSpacing ?? 0), -10, 80);
  const lineStep = fSize * clamp(Number(srcObj.lineHeight ?? 1.18), 0.75, 2.5);
  const padX = clamp(Number(srcObj.paddingX ?? 96), 0, 360);
  const align = srcObj.align || 'center';
  const anchorX = align === 'left' ? padX : (align === 'right' ? (w - padX) : w * 0.5);

  if (anim === 'marquee-left' || anim === 'marquee-right') {
    const singleLine = resolved.replace(/\r?\n/g, '   •   ');
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${tracking}px`;
    const unitText = `${singleLine}     •     `;
    const unitW = Math.max(120, ctx.measureText(unitText).width + unitText.length * Math.max(0, tracking * 0.15));
    const pxPerSec = 260;
    const rawShift = (srcObj.simTime * pxPerSec) % unitW;
    const startX = anim === 'marquee-left' ? -rawShift : (rawShift - unitW);
    for (let x = startX; x < w + unitW; x += unitW) {
      drawTrackedTextLine(ctx, unitText, x, h * 0.5, tracking, 'left', strokeW > 0.2);
    }
  } else {
    let displayStr = resolved;
    if (anim === 'typewriter') {
      const totalChars = Array.from(resolved);
      const charsPerSec = 12;
      const cycleLen = totalChars.length + 14;
      const shown = Math.min(totalChars.length, Math.floor((srcObj.simTime * charsPerSec) % Math.max(1, cycleLen)));
      const cursor = (Math.floor(srcObj.simTime * 2.5) % 2 === 0) ? '▋' : '';
      displayStr = totalChars.slice(0, shown).join('') + cursor;
    }

    const lines = displayStr.split(/\r?\n/);
    const blockH = (lines.length - 1) * lineStep;
    let baseY = (h * 0.5) - (blockH * 0.5);

    if (anim === 'scroll-up') {
      const span = h + blockH + fSize * 1.5;
      const offset = (srcObj.simTime * 140) % span;
      baseY = (h + fSize * 0.6) - offset;
    }

    for (let i = 0; i < lines.length; i++) {
      drawTrackedTextLine(ctx, lines[i], anchorX, baseY + i * lineStep, tracking, align, strokeW > 0.2);
    }
  }

  ctx.restore();

  gl.bindTexture(gl.TEXTURE_2D, srcObj.texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcObj.canvas);

  srcObj._lastRenderedText = resolved;
  const wasDirty = srcObj._textDirty || srcObj._thumbDirty;
  srcObj._textDirty = false;

  if (wasDirty && !state.isProjectorRole) {
    srcObj._thumbDirty = false;
    srcObj.thumbUrl = captureMediaThumb(srcObj.canvas, w, h);
    if (typeof renderMediaBin === 'function') renderMediaBin();
  }
}

// ============================================================================
// 4. 1-CLICK INDEXEDDB FileSystemFileHandle RECONNECT & .wmshow.json ARCHIVE
// ============================================================================

const HANDLE_DB_NAME = 'webmapper_file_handles_v1';
const HANDLE_STORE_NAME = 'handles';
let cachedMatchingHandles = [];

function openHandleIdb() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined' || !indexedDB) {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(HANDLE_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(HANDLE_STORE_NAME)) {
          db.createObjectStore(HANDLE_STORE_NAME, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });
}

async function idbSaveFileHandle(fileName, fileSize, handle) {
  if (!fileName || !handle || state.isProjectorRole) return false;
  const db = await openHandleIdb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(HANDLE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(HANDLE_STORE_NAME);
      const lower = String(fileName).toLowerCase();
      store.put({
        key: `${lower}::${Number(fileSize) || 0}`,
        fileName: String(fileName),
        fileNameLower: lower,
        fileSize: Number(fileSize) || 0,
        savedAt: Date.now(),
        handle
      });
      tx.oncomplete = () => {
        db.close();
        refreshSavedHandleMatches();
        resolve(true);
      };
      tx.onerror = () => { db.close(); resolve(false); };
    } catch (_) {
      try { db.close(); } catch (_e) {}
      resolve(false);
    }
  });
}

async function idbLoadAllFileHandles() {
  const db = await openHandleIdb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(HANDLE_STORE_NAME, 'readonly');
      const store = tx.objectStore(HANDLE_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        db.close();
        resolve(Array.isArray(req.result) ? req.result : []);
      };
      req.onerror = () => { db.close(); resolve([]); };
    } catch (_) {
      try { db.close(); } catch (_e) {}
      resolve([]);
    }
  });
}

async function refreshSavedHandleMatches() {
  if (state.isProjectorRole) return [];
  const offlineSources = state.sources.filter(s => s.offline && (s.kind === 'video' || s.kind === 'image'));
  const topBtn = document.getElementById('btn-oneclick-reconnect');
  const dlgBtn = document.getElementById('btn-relink-handles');

  if (offlineSources.length === 0) {
    cachedMatchingHandles = [];
    if (topBtn) topBtn.hidden = true;
    if (dlgBtn) dlgBtn.hidden = true;
    return [];
  }

  const allRecords = await idbLoadAllFileHandles();
  const matches = [];
  for (const src of offlineSources) {
    const fLower = String(src.fileName || '').toLowerCase();
    if (!fLower) continue;
    let rec = allRecords.find(r => r.fileNameLower === fLower && (!src.fileSize || r.fileSize === src.fileSize));
    if (!rec) {
      rec = allRecords.find(r => r.fileNameLower === fLower);
    }
    if (rec && rec.handle) {
      matches.push({ src, handle: rec.handle });
    }
  }

  cachedMatchingHandles = matches;
  const count = matches.length;
  if (topBtn) {
    topBtn.hidden = count === 0;
    topBtn.textContent = `⚡ Reconnect (${count})`;
  }
  if (dlgBtn) {
    dlgBtn.hidden = count === 0;
    dlgBtn.textContent = `⚡ 1-Click Reconnect ${count} Saved File Handle${count === 1 ? '' : 's'}`;
  }
  return matches;
}

async function reconnectAllSavedHandles() {
  const matches = cachedMatchingHandles.length > 0
    ? cachedMatchingHandles
    : await refreshSavedHandleMatches();

  if (matches.length === 0) {
    openRelinkModal();
    return 0;
  }

  let reconnected = 0;
  for (const { src, handle } of matches) {
    if (!src.offline || !handle) continue;
    try {
      let perm = typeof handle.queryPermission === 'function'
        ? await handle.queryPermission({ mode: 'read' })
        : 'granted';
      if (perm !== 'granted' && typeof handle.requestPermission === 'function') {
        perm = await handle.requestPermission({ mode: 'read' });
      }
      if (perm !== 'granted') continue;

      const file = await handle.getFile();
      if (!file) continue;
      if (isVideoFile(file)) {
        addVideoSourceFromFile(file, src);
        reconnected++;
      } else if (isImageFile(file)) {
        addImageSourceFromFile(file, src);
        reconnected++;
      }
    } catch (_) {}
  }

  await refreshSavedHandleMatches();
  if (typeof renderRelinkDialogList === 'function') renderRelinkDialogList();
  if (typeof updateRelinkBadgeUI === 'function') updateRelinkBadgeUI();

  const remaining = state.sources.filter(s => s.offline).length;
  if (reconnected > 0) {
    showToast(remaining === 0
      ? `⚡ Reconnected all ${reconnected} show clip(s) in 1 click!`
      : `⚡ Reconnected ${reconnected} clip(s) • ${remaining} remaining`);
    if (remaining === 0) {
      const dlg = document.getElementById('relink-dialog');
      if (dlg && dlg.open) dlg.close();
    }
  } else {
    showToast('File permission declined or file moved — select files manually');
  }
  return reconnected;
}

async function pickMediaFilesWithHandles(forRelink = false, fallbackInputEl = null) {
  if (typeof window.showOpenFilePicker === 'function') {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: true,
        types: [
          {
            description: 'Chaos CathodeRay media, shaders & shows',
            accept: {
              'video/*': ['.mp4', '.webm', '.mov', '.m4v', '.ogv'],
              'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'],
              'application/json': ['.json']
            }
          }
        ]
      });
      if (!handles || handles.length === 0) return;

      const files = [];
      for (const h of handles) {
        if (!h || h.kind !== 'file') continue;
        const f = await h.getFile();
        files.push(f);
        if (isVideoFile(f) || isImageFile(f)) {
          idbSaveFileHandle(f.name, f.size, h);
        }
      }
      if (forRelink) batchRelinkFiles(files);
      else handleDroppedOrPickedFiles(files);
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      // SecurityError on strict file:// or unsupported context -> fall back to <input type="file">
    }
  }
  if (fallbackInputEl) fallbackInputEl.click();
}

function captureDroppedFileHandles(dataTransfer) {
  if (!dataTransfer || !dataTransfer.items) return;
  const items = Array.from(dataTransfer.items);
  for (const item of items) {
    if (item && item.kind === 'file' && typeof item.getAsFileSystemHandle === 'function') {
      item.getAsFileSystemHandle().then(async (handle) => {
        if (handle && handle.kind === 'file') {
          try {
            const f = await handle.getFile();
            if (f && (isVideoFile(f) || isImageFile(f))) {
              await idbSaveFileHandle(f.name, f.size, handle);
            }
          } catch (_) {}
        }
      }).catch(() => {});
    }
  }
}

// Self-Contained .wmshow.json Archive Pack / Unpack Helpers
const MAX_PACK_SINGLE_VIDEO_BYTES = 32 * 1024 * 1024; // 32 MB per inline video clip
const MAX_PACK_TOTAL_MEDIA_BYTES = 96 * 1024 * 1024;  // 96 MB safe JSON string ceiling

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function dataUrlToFile(dataUrl, fileName = 'embedded.mp4', fallbackMime = 'application/octet-stream') {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) return null;
  const header = dataUrl.slice(5, commaIdx);
  const b64 = dataUrl.slice(commaIdx + 1);
  const mimeMatch = header.match(/^([^;]+)/);
  const mime = (mimeMatch && mimeMatch[1]) ? mimeMatch[1] : fallbackMime;

  let bytes;
  if (typeof atob === 'function') {
    const binStr = atob(b64);
    bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
      bytes[i] = binStr.charCodeAt(i);
    }
  } else if (typeof Buffer !== 'undefined') {
    bytes = new Uint8Array(Buffer.from(b64, 'base64'));
  } else {
    return null;
  }

  try {
    return new File([bytes], fileName, { type: mime });
  } catch (_) {
    const blob = new Blob([bytes], { type: mime });
    blob.name = fileName;
    return blob;
  }
}

async function buildSelfContainedShowArchiveObject() {
  const data = serializeShowData(true);
  data.bundleType = 'wmshow-archive';

  let totalPackedBytes = 0;
  let embeddedCount = 0;
  let skippedLargeCount = 0;

  for (const entry of data.sources) {
    if (entry.kind !== 'video' && entry.kind !== 'image') continue;
    const liveSrc = state.sources.find(s => s.id === entry.id);
    if (!liveSrc || liveSrc.offline) continue;

    if (entry.kind === 'image' && entry.inlineDataUrl) {
      entry.embeddedDataUrl = entry.inlineDataUrl;
      embeddedCount++;
      continue;
    }

    if (liveSrc.file && liveSrc.file.size > 0) {
      const fSize = liveSrc.file.size;
      const limit = entry.kind === 'video' ? MAX_PACK_SINGLE_VIDEO_BYTES : (20 * 1024 * 1024);
      if (fSize <= limit && (totalPackedBytes + fSize) <= MAX_PACK_TOTAL_MEDIA_BYTES) {
        try {
          const dUrl = await fileToDataUrl(liveSrc.file);
          if (dUrl) {
            entry.embeddedDataUrl = dUrl;
            entry.mimeType = liveSrc.file.type || (entry.kind === 'video' ? 'video/mp4' : 'image/png');
            totalPackedBytes += fSize;
            embeddedCount++;
          }
        } catch (_) {}
      } else {
        skippedLargeCount++;
      }
    }
  }

  return { data, embeddedCount, skippedLargeCount };
}

async function exportSelfContainedShowArchive() {
  showToast('📦 Packing a self-contained show pack…');
  const { data, embeddedCount, skippedLargeCount } = await buildSelfContainedShowArchiveObject();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chaos-cathoderay-pack-${stamp}${APP_PACK_EXT}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);

  if (skippedLargeCount > 0) {
    showToast(`📦 Packed show (${embeddedCount} media embedded • ${skippedLargeCount} clip >32MB kept external)`);
  } else {
    showToast(`📦 Exported self-contained show pack (${embeddedCount} media embedded)`);
  }
  if (typeof markShowSavedToFile === 'function') markShowSavedToFile();
}
