#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
/**
 * WebMapper v2.0 — Zero-Dependency Automated Test & Verification Suite
 * Covers Milestones 1–6:
 *   - Read-only milestone preservation & zero-CDN offline portability
 *   - DOM ID integrity & modern-web-guidance HTML/CSS accessibility invariants
 *   - RFC 6455 WebSocket / OSC / Art-Net local bridge codec
 *   - Homography math, Catmull-Rom mesh, Perspective Grid Cloner, SVG & ISF v2
 *   - Spatial Radar, Shepard 2D Cue Constellation, Audio/MIDI/OSC & Timeline
 *   - Multi-Projector Optical Edge-Blending (unity intensity I1^g + I2^g = 1.000) & GPU Frame Delay
 *   - LED Pixel Mapper, Serpentine Matrix, Universe Rollover, ENTTEC USB-DMX & Art-Net OpDmx
 *   - Frozen Public Extension Hook API (window.WebMapperAPI) & Show JSON v2.0 round-trip
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src');

// ============================================================================
// 1. PRESERVED MILESTONES & PORTABLE BUNDLE AUDIT
// ============================================================================
// Historical archives live only on the author's machine (not in the repository): check them when present.
const archives = [['WebMapper-V1.html', 197133], ['reference_Still-Rising.html', 141043]].filter(([f]) => fs.existsSync(path.join(root, f)));
for (const [f, size] of archives) {
  const got = fs.statSync(path.join(root, f)).size;
  assert.strictEqual(got, size, `${f} modified! Expected ${size}, got ${got}`);
}
console.log(`✓ [1/12] Portable bundle checks${archives.length ? ` + ${archives.length} local archive(s) untouched` : ''}`);

const bodyHtml = fs.readFileSync(path.join(srcDir, 'body.html'), 'utf8');
const stylesCss = fs.readFileSync(path.join(srcDir, 'styles.css'), 'utf8');
const bundledHtml = fs.readFileSync(path.join(root, 'Chaos-CathodeRay.html'), 'utf8');

assert(!/https?:\/\/(cdn|unpkg|jsdelivr|esm\.sh)/i.test(bundledHtml), 'Chaos-CathodeRay.html must remain 100% zero-dependency & offline-portable');

const htmlIds = new Set();
for (const m of bodyHtml.matchAll(/\bid="([^"]+)"/g)) {
  assert(!htmlIds.has(m[1]), `Duplicate HTML id found: #${m[1]}`);
  htmlIds.add(m[1]);
}

const jsFiles = fs.readdirSync(srcDir).filter(f => /^\d+.*\.js$/.test(f)).sort();
assert.strictEqual(jsFiles.length, 26, `Expected 26 modular JS files in src/, found ${jsFiles.length}`);

// Verify standalone HD H.264+AAC .mp4 demo videos exist in ./demos/ with valid ISO BMFF ftyp box
for (const demoFile of ['demo-1-kinetic-drums-120bpm.mp4', 'demo-2-stage-beams-128bpm.mp4']) {
  const dp = path.join(root, 'demos', demoFile);
  assert(fs.existsSync(dp), `Missing standalone demo video: demos/${demoFile}`);
  const hdr = fs.readFileSync(dp).subarray(0, 12);
  assert.strictEqual(hdr.subarray(4, 8).toString('ascii'), 'ftyp', `demos/${demoFile} must have valid MP4 ftyp header`);
  assert(fs.statSync(dp).size > 50 * 1024, `demos/${demoFile} unexpectedly small`);
}

const missingIds = [];
for (const jf of jsFiles) {
  const code = fs.readFileSync(path.join(srcDir, jf), 'utf8');
  for (const m of code.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (!htmlIds.has(m[1])) {
      missingIds.push(`${jf}: #${m[1]}`);
    }
  }
}
assert.strictEqual(missingIds.length, 0, `Missing DOM IDs referenced in JS:\n${missingIds.join('\n')}`);

// ============================================================================
// 2. MODERN WEB GUIDANCE HTML, CSS & ACCESSIBILITY INVARIANTS
// ============================================================================
const dialogTags = [...bodyHtml.matchAll(/<dialog\b[^>]*>/g)].map(m => m[0]);
assert.strictEqual(dialogTags.length, 13, `Expected 13 native <dialog> elements (incl. 0.1 #start-dialog, #report-dialog, #fresh-dialog & #about-dialog), found ${dialogTags.length}`);
for (const dt of dialogTags) {
  assert(dt.includes('closedby="any"'), `Dialog missing closedby="any": ${dt}`);
  assert(dt.includes('aria-labelledby='), `Dialog missing aria-labelledby: ${dt}`);
  assert(!dt.includes('role="dialog"') && !dt.includes('aria-modal'), `Dialog must not add role="dialog" or aria-modal: ${dt}`);
}
assert(!/(^|\})\s*dialog\s*\{[^}]*\bdisplay\s*:/m.test(stylesCss), 'Never set unconditional display on dialog (must scope with dialog[open])');
assert(stylesCss.includes('dialog:modal') && stylesCss.includes('overscroll-behavior: contain'), 'Modal dialogs must contain overscroll');

// Native <details>/<summary> disclosures (#disc-multiproj, #disc-dmx)
const detailsBlocks = [...bodyHtml.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/g)];
assert(detailsBlocks.length >= 2, `Expected >= 2 native <details> disclosures, found ${detailsBlocks.length}`);
for (const db of detailsBlocks) {
  const inner = db[1].trimStart();
  assert(inner.startsWith('<summary'), '<summary> must be the first child of <details>');
  const sumMatch = inner.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/);
  assert(sumMatch, '<details> missing closing </summary>');
  assert(!/<(button|a|input|select|textarea)\b/i.test(sumMatch[1]), 'Must not nest interactive elements inside <summary>');
}
assert(stylesCss.includes('summary.studio-disclosure-summary::after'), 'Custom disclosures hiding list-style marker must provide ::after directional cue');

// Native <input type="range"> sliders + separated vendor pseudo-selectors
const labelForIds = new Set([...bodyHtml.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)].map(m => m[1]));
const rangeTags = [...bodyHtml.matchAll(/<input\b[^>]*type="range"[^>]*>/g)].map(m => m[0]);
assert(rangeTags.length >= 70, `Expected >= 70 static range sliders, found ${rangeTags.length}`);
for (const rt of rangeTags) {
  const idMatch = rt.match(/\bid="([^"]+)"/);
  assert(idMatch, `Range input missing id: ${rt}`);
  const id = idMatch[1];
  for (const attr of ['min=', 'max=', 'step=', 'value=']) {
    assert(rt.includes(attr), `Range #${id} missing ${attr}`);
  }
  const hasLabel = labelForIds.has(id) || rt.includes('aria-label=');
  assert(hasLabel, `Range #${id} missing <label for="${id}"> or aria-label`);
}
assert(!/::-webkit-slider-[^{]*,[^\{]*::-moz-range-|::-moz-range-[^{]*,[^\{]*::-webkit-slider-/.test(stylesCss),
  'Never combine ::-webkit-slider-* and ::-moz-range-* in a single selector list');

const code08 = fs.readFileSync(path.join(srcDir, '08-events-boot.js'), 'utf8');
assert(code08.includes("'closedBy' in HTMLDialogElement.prototype"), 'Must provide light-dismiss coordinate fallback when closedBy is unsupported');
assert(code08.includes("edgeblendDialog.returnValue = ''"), 'edgeblendDialog close listener must reset dialog.returnValue');
assert(code08.includes("ArrowRight") && code08.includes('[role="tablist"]'), 'Tablists must implement WAI-ARIA ArrowLeft/ArrowRight keyboard navigation');

for (const removedDupId of [
  'btn-topbar-blend', 'btn-topbar-dmx', 'tab-left-dmx', 'left-dmx-pane',
  'dmx-fixture-list', 'tab-insp-dmx', 'insp-pane-dmx'
]) {
  assert(!htmlIds.has(removedDupId), `Duplicate UI entry #${removedDupId} must remain consolidated out of body.html`);
}
for (const reqId of [
  'hidden-media-pool', 'disc-multiproj', 'disc-dmx', 'sel-audio-device',
  'sel-audio-video-src', 'btn-audio-vid-speaker', 'btn-audio-load-video',
  'btn-audio-capture-window', 'audio-source-status',
  'btn-demo-vid-1', 'btn-demo-vid-2', 'btn-audio-demo-1', 'btn-audio-demo-2',
  'show-rail', 'rig-pane', 'rig-canvas', 'synoptic-strip', 'cmd-palette-dialog',
  'btn-load-keep-venue', 'btn-cue-scope', 'btn-shutter-handles',
  'btn-mask-edit-stage', 'btn-3d-drop-outlier', 'pie-menu-overlay'
]) {
  assert(htmlIds.has(reqId), `Expected consolidated UI / Studio UX control #${reqId} in body.html`);
}
// Verify global shortcut handler never hijacks WAI-ARIA Tab navigation (only scoped inside #isf-code-editor)
const globalKeyBlock = code08.slice(code08.indexOf('// 8. Global Keyboard Shortcuts'));
assert(!/e\.key\s*===\s*['"]Tab['"]/.test(globalKeyBlock), 'Global keydown handler must never hijack Tab keyboard navigation');
assert(bodyHtml.includes('<search>'), 'Command Palette must use semantic <search> landmark');
assert(
  bodyHtml.indexOf('id="disc-multiproj"') > bodyHtml.indexOf('id="insp-pane-output"') &&
  bodyHtml.indexOf('id="disc-dmx"') > bodyHtml.indexOf('id="disc-multiproj"') &&
  bodyHtml.indexOf('id="disc-dmx"') < bodyHtml.indexOf('Master Output GPU Post-FX Rack'),
  '#disc-multiproj and #disc-dmx must live in their single canonical home inside #insp-pane-output'
);
assert(
  !/<details[^>]*id="disc-(multiproj|dmx)"[^>]*\bopen\b/i.test(bodyHtml),
  '#disc-multiproj and #disc-dmx <details> disclosures must start closed by default'
);

console.log(`✓ [2/12] DOM & Modern Web Guidance audits passed (${jsFiles.length} modules, ${htmlIds.size} IDs, ${dialogTags.length} dialogs, ${detailsBlocks.length} disclosures, ${rangeTags.length} sliders)`);

// ============================================================================
// 3. LOCAL OSC / ART-NET WEBSOCKET BRIDGE CODEC AUDIT
// ============================================================================
const bridge = require(path.join(root, 'scripts', 'osc-artnet-bridge.js'));
{
  const oscSample = Buffer.from('/webmapper/cue\0\0,i\0\0\0\0\0\x02', 'binary');
  const srvFrame = bridge.encodeWsFrame(oscSample, 0x02);
  const decodedSrv = [];
  bridge.decodeWsFrames(srvFrame, { buf: Buffer.alloc(0) }, (op, pl) => decodedSrv.push({ op, pl }));
  assert.strictEqual(decodedSrv.length, 1);
  assert.strictEqual(decodedSrv[0].op, 0x02);
  assert(decodedSrv[0].pl.equals(oscSample), 'Server RFC 6455 binary frame round-tripped identically');

  // Masked client -> server 530-byte Art-Net OpDmx packet fragmented across 2 TCP chunks
  const artNetPayload = Buffer.alloc(530);
  artNetPayload.write('Art-Net\0', 0, 'ascii');
  artNetPayload[9] = 0x50;
  artNetPayload[18] = 255;
  const maskKey = Buffer.from([0x37, 0xfa, 0x21, 0x3d]);
  const maskedHeader = Buffer.alloc(8);
  maskedHeader[0] = 0x82;
  maskedHeader[1] = 0x80 | 126;
  maskedHeader.writeUInt16BE(artNetPayload.length, 2);
  maskKey.copy(maskedHeader, 4);
  const maskedBody = Buffer.from(artNetPayload);
  for (let i = 0; i < maskedBody.length; i++) maskedBody[i] ^= maskKey[i & 3];

  const decodedClient = [];
  const parserState = { buf: Buffer.alloc(0) };
  const fullMasked = Buffer.concat([maskedHeader, maskedBody]);
  bridge.decodeWsFrames(fullMasked.subarray(0, 64), parserState, (op, pl) => decodedClient.push({ op, pl }));
  assert.strictEqual(decodedClient.length, 0);
  bridge.decodeWsFrames(fullMasked.subarray(64), parserState, (op, pl) => decodedClient.push({ op, pl }));
  assert.strictEqual(decodedClient.length, 1);
  assert(decodedClient[0].pl.equals(artNetPayload), 'Fragmented 530-byte masked Art-Net client frame decoded identically');
}
console.log('✓ [3/12] Local OSC & Art-Net Bridge RFC 6455 handshake & binary frame codec verified');

// ============================================================================
// 4–12. FULL HEADLESS VM EXECUTION OF WEBMAPPER ENGINE (MILESTONES 1–7C + UX STUDIO)
// ============================================================================
const modSrc = name => fs.readFileSync(path.join(srcDir, name), 'utf8');
const engineModulesSource = [
  '00-app-identity.js',
  '01-shaders.js',
  '01b-isf-fx-shaders.js',
  '02-math-mesh.js',
  '02b-math-3d-obj-pnp.js',
  '03-state-media.js',
  '03b-mixbus-plugins.js',
  '03c-capture-text-idb.js',
  '03d-demo-videos.js',
  '04-webgl-engine.js',
  '05-show-sync-io.js',
  '05b-svg-templates-scanner.js',
  '05c-modulators-audio-midi-osc.js',
  '05d-mix-constellation-timeline.js',
  '05e-multiproj-dmx-api.js',
  '05f-stageplan-videolight.js',
  '05g-rooms-devices-spots.js',
  '05h-venue-previz.js',
  '05i-program-preview.js',
  '05j-venue-parts.js',
  '05k-projector-align.js',
  '05l-beta-start-check.js',
  '07b-ux-studio-systems.js'
].map(modSrc).join('\n;\n');

const vmScript = `
(async () => {
  const domElements = new Map();
  function makeMockCanvas(w = 640, h = 360) {
    const drawLog = [];
    const ctx = {
      fillStyle: '#000',
      strokeStyle: '#fff',
      lineWidth: 1,
      font: '12px sans-serif',
      textAlign: 'left',
      textBaseline: 'middle',
      globalAlpha: 1,
      shadowColor: 'transparent',
      shadowBlur: 0,
      save() {}, restore() {}, scale() {}, translate() {}, rotate() {},
      roundRect() {}, ellipse() {}, setTransform() {}, clearRect() {},
      fillRect(x, y, rw, rh) { drawLog.push(['fillRect', x, y, rw, rh]); },
      strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
      bezierCurveTo() {}, quadraticCurveTo() {}, closePath() {}, arc() {},
      clip() {}, fill() {}, stroke() {}, setLineDash() {},
      createRadialGradient() { return { addColorStop() {} }; },
      createLinearGradient() { return { addColorStop() {} }; },
      fillText(txt, x, y) { drawLog.push(['fillText', String(txt), x, y]); },
      strokeText() {},
      measureText(txt) { return { width: String(txt).length * 8 }; },
      drawImage() {},
      getImageData(x, y, iw, ih) { return { data: new Uint8ClampedArray(iw * ih * 4) }; }
    };
    return {
      width: w,
      height: h,
      clientWidth: w,
      clientHeight: h,
      style: {},
      _drawLog: drawLog,
      getBoundingClientRect() { return { left: 0, top: 0, width: w, height: h }; },
      getContext(kind) {
        if (kind === 'webgl2') return mockGl;
        return ctx;
      },
      toDataURL() { return 'data:image/jpeg;base64,AA=='; },
      captureStream() { return { getVideoTracks() { return [{ stop() {} }]; }, getTracks() { return [{ stop() {} }]; } }; }
    };
  }

  let texCounter = 1, fboCounter = 1, bufCounter = 1, progCounter = 1;
  // Synthetic RGBA pattern injected by mock gl.readPixels for DMX Pixel Mapper verification
  let mockReadPixelsPainter = null;

  const mockGl = {
    VERTEX_SHADER: 0x8B31, FRAGMENT_SHADER: 0x8B30, COMPILE_STATUS: 0x8B81, LINK_STATUS: 0x8B82,
    TEXTURE_2D: 0x0DE1, FRAMEBUFFER: 0x8D40, FRAMEBUFFER_COMPLETE: 0x8CD5, COLOR_ATTACHMENT0: 0x8CE0,
    RGBA: 0x1908, RGBA8: 0x8058, RGBA16F: 0x881A, UNSIGNED_BYTE: 0x1401, HALF_FLOAT: 0x140B, FLOAT: 0x1406,
    TEXTURE_MIN_FILTER: 0x2801, TEXTURE_MAG_FILTER: 0x2800, TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803,
    LINEAR: 0x2601, CLAMP_TO_EDGE: 0x812F, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241, UNPACK_ALIGNMENT: 0x0CF5, PACK_ALIGNMENT: 0x0D05,
    SCISSOR_TEST: 0x0C11, BLEND: 0x0BE2, DEPTH_TEST: 0x0B71, CULL_FACE: 0x0B44, FRONT: 0x0404, BACK: 0x0405, LEQUAL: 0x0203,
    RENDERBUFFER: 0x8D41, DEPTH_COMPONENT24: 0x81A6, DEPTH_ATTACHMENT: 0x8D00,
    SRC_ALPHA: 0x0302, ONE_MINUS_SRC_ALPHA: 0x0303, ONE: 1, ZERO: 0,
    ARRAY_BUFFER: 0x8892, ELEMENT_ARRAY_BUFFER: 0x8893, DYNAMIC_DRAW: 0x88E8, STATIC_DRAW: 0x88E4,
    TRIANGLES: 0x0004, UNSIGNED_SHORT: 0x1403, COLOR_BUFFER_BIT: 0x4000, DEPTH_BUFFER_BIT: 0x0100,
    TEXTURE0: 0x84C0, TEXTURE1: 0x84C1, TEXTURE2: 0x84C2,
    getExtension(name) { return name === 'EXT_color_buffer_float' ? {} : null; },
    createShader() { return {}; },
    shaderSource() {},
    compileShader() {},
    getShaderParameter() { return true; },
    getShaderInfoLog() { return ''; },
    deleteShader() {},
    createProgram() { return { id: progCounter++ }; },
    attachShader() {},
    linkProgram() {},
    getProgramParameter() { return true; },
    getProgramInfoLog() { return ''; },
    deleteProgram() {},
    getUniformLocation(_p, name) { return { name }; },
    createVertexArray() { return { vao: 1 }; },
    deleteVertexArray() {},
    bindVertexArray() {},
    createBuffer() { return { id: bufCounter++ }; },
    deleteBuffer() {},
    bindBuffer() {},
    bufferData() {},
    enableVertexAttribArray() {},
    vertexAttribPointer() {},
    createTexture() { return { id: texCounter++ }; },
    deleteTexture() {},
    bindTexture() {},
    activeTexture() {},
    pixelStorei() {},
    texParameteri() {},
    texImage2D() {},
    createRenderbuffer() { return { rbo: fboCounter++ }; },
    deleteRenderbuffer() {},
    bindRenderbuffer() {},
    renderbufferStorage() {},
    framebufferRenderbuffer() {},
    createFramebuffer() { return { id: fboCounter++ }; },
    deleteFramebuffer() {},
    bindFramebuffer() {},
    framebufferTexture2D() {},
    checkFramebufferStatus() { return 0x8CD5; },
    viewport() {},
    scissor() {},
    enable() {},
    disable() {},
    depthFunc() {},
    depthMask() {},
    cullFace() {},
    blendFunc() {},
    blendFuncSeparate() {},
    clearColor() {},
    clear() {},
    useProgram() {},
    blendEquation() {}, blendFunc() {}, blendFuncSeparate() {},
    depthFunc() {}, depthMask() {}, cullFace() {}, frontFace() {},
    uniform1i() {}, uniform1f() {}, uniform2f() {}, uniform3f() {}, uniform4f() {},
    uniform1fv() {}, uniform3fv() {}, uniformMatrix3fv() {}, uniformMatrix4fv() {},
    drawArrays() {},
    drawElements() {},
    readPixels(x, y, w, h, _fmt, _type, dst) {
      if (typeof mockReadPixelsPainter === 'function') {
        mockReadPixelsPainter(x, y, w, h, dst);
      } else {
        for (let i = 0; i < dst.length; i += 4) {
          dst[i] = 200; dst[i + 1] = 100; dst[i + 2] = 50; dst[i + 3] = 255;
        }
      }
    }
  };

  const mockGlCanvas = makeMockCanvas(1280, 720);
  const mixCanvas = makeMockCanvas(540, 480);
  mixCanvas.parentElement = { getBoundingClientRect() { return { left: 0, top: 0, width: 540, height: 480 }; } };
  domElements.set('gl-engine', mockGlCanvas);
  domElements.set('audio-fft-canvas', makeMockCanvas(260, 56));
  domElements.set('mix-radar-canvas', mixCanvas);
  domElements.set('timeline-canvas', makeMockCanvas(720, 160));
  domElements.set('dmx-monitor-canvas', makeMockCanvas(256, 48));
  domElements.set('timeline-scroll-viewport', { clientWidth: 720, scrollLeft: 0, scrollTop: 0 });
  domElements.set('timeline-drawer', { hidden: true });
  domElements.set('btn-toggle-timeline', { classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {} });
  domElements.set('btn-midi-learn', { classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, textContent: '' });

  let mockGamepads = [null];
  const serialWrittenPackets = [];
  const serialBreakSignals = [];
  const mockSerialPort = {
    async open(opts) { this.openOpts = opts; },
    async close() { this.closed = true; },
    async setSignals(sig) { serialBreakSignals.push(sig); },
    writable: {
      getWriter() {
        return {
          async write(chunk) { serialWrittenPackets.push(new Uint8Array(chunk)); },
          releaseLock() {}
        };
      }
    }
  };

  let lastDisplayMediaConstraints = null;
  const createdGainNodes = [];
  const createdBufferSources = [];
  const createdStreamSources = [];
  class MockAudioContext {
    constructor() {
      this.state = 'running';
      this.sampleRate = 48000;
      this.currentTime = 0;
      this.destination = { kind: 'destination' };
    }
    async resume() { this.state = 'running'; }
    createAnalyser() {
      return {
        kind: 'analyser',
        fftSize: 1024,
        minDecibels: -100,
        maxDecibels: -30,
        frequencyBinCount: 512,
        smoothingTimeConstant: 0.72,
        connections: [],
        connect(t) { this.connections.push(t); },
        disconnect() { this.connections.length = 0; },
        getByteFrequencyData(buf) {
          for (let i = 0; i < buf.length; i++) buf[i] = i < 40 ? 210 : 60;
        }
      };
    }
    createGain() {
      const g = {
        gain: { value: 1.0 },
        connections: [],
        connect(t) { this.connections.push(t); },
        disconnect() { this.connections.length = 0; }
      };
      createdGainNodes.push(g);
      return g;
    }
    createBuffer(numCh, length, sampleRate) {
      const chs = Array.from({ length: numCh }, () => new Float32Array(length));
      return {
        numberOfChannels: numCh,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData(c) { return chs[c]; }
      };
    }
    createBufferSource() {
      const bs = {
        buffer: null,
        playbackRate: { value: 1.0 },
        connections: [],
        startedAtOffset: null,
        stopped: false,
        onended: null,
        connect(t) { this.connections.push(t); },
        disconnect() { this.connections.length = 0; },
        start(_when = 0, offset = 0) { this.startedAtOffset = offset; },
        stop() { this.stopped = true; }
      };
      createdBufferSources.push(bs);
      return bs;
    }
    createMediaElementSource(mediaEl) {
      return {
        kind: 'mediaElementSource',
        mediaEl,
        connections: [],
        connect(t) { this.connections.push(t); },
        disconnect() { this.connections.length = 0; }
      };
    }
    createMediaStreamSource(stream) {
      const n = { stream, connections: [], connect(t) { this.connections.push(t); }, disconnect() { this.connections.length = 0; } };
      createdStreamSources.push(n);
      return n;
    }
    createMediaStreamDestination() {
      return { kind: 'captureDest', stream: { getAudioTracks() { return [{ id: 'cap_aud_1' }]; } } };
    }
  }

  const navigator = {
    getGamepads() { return mockGamepads; },
    mediaDevices: {
      async enumerateDevices() {
        return [{ kind: 'audioinput', deviceId: 'virtual_2ch', label: 'Virtual Audio 2ch' }];
      },
      async getDisplayMedia(constraints) {
        lastDisplayMediaConstraints = constraints;
        return {
          getTracks() { return [{ stop() {} }, { stop() {} }]; },
          getVideoTracks() {
            return [{
              label: 'Browser Tab: Music Session',
              getSettings() { return { displaySurface: 'browser', width: 1920, height: 1080 }; },
              addEventListener() {},
              stop() {}
            }];
          },
          getAudioTracks() {
            return [{ id: 'syp_aud_1', label: 'Tab Audio', enabled: true, readyState: 'live', stop() {} }];
          }
        };
      }
    },
    serial: {
      async requestPort() { return mockSerialPort; }
    }
  };
  globalThis.navigator = navigator;

  const openedPopups = [];
  const window = {
    AudioContext: MockAudioContext,
    location: { href: 'file:///home/user/chaos-cathoderay/Chaos-CathodeRay.html', search: '' },
    devicePixelRatio: 1,
    screenX: 0,
    screenY: 0,
    addEventListener() {},
    async getScreenDetails() {
      const current = { availLeft: 0, availTop: 0, availWidth: 1440, availHeight: 900 };
      return {
        currentScreen: current,
        screens: [
          current,
          { availLeft: 1440, availTop: 0, availWidth: 1920, availHeight: 1080 },
          { availLeft: 3360, availTop: 0, availWidth: 1920, availHeight: 1080 }
        ]
      };
    },
    open(url, name, features) {
      const win = { url, name, features, closed: false, focus() {}, postMessage() {} };
      openedPopups.push(win);
      return win;
    }
  };
  globalThis.window = window;

  const document = {
    documentElement: { style: { setProperty() {} } },
    body: { classList: { toggle() {}, add() {}, remove() {} }, appendChild() {} },
    getElementById(id) { return domElements.get(id) || null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    createElement(tag) {
      if (tag === 'canvas') return makeMockCanvas(640, 360);
      if (tag === 'img') {
        return { naturalWidth: 320, naturalHeight: 180, complete: true, set src(v) { this._src = v; } };
      }
      if (tag === 'video') {
        return {
          playsInline: true,
          muted: true,
          volume: 1,
          paused: false,
          videoWidth: 1920,
          videoHeight: 1080,
          addEventListener() {},
          async play() { this.paused = false; },
          pause() { this.paused = true; }
        };
      }
      return { click() {}, remove() {}, style: {}, classList: { toggle() {} }, setAttribute() {} };
    }
  };
  globalThis.document = document;

  // UI no-op stubs for 07-ui-lists-inspectors.js & 08-events-boot.js hooks
  function escapeHtml(str) { return String(str); }
  function setSliderValue(el, val) { if (el) el.value = String(val); }
  function syncStageModePill() {}
  function setLayoutMode(mode) { state.layoutMode = mode; }
  function toggleShaderStudioDrawer() {}
  function toggleTimelineDrawer() {}
  function openSpaceScannerModal() {}
  function toggleSpotSteerMode(v) { state.steerSpotMode = typeof v === 'boolean' ? v : !state.steerSpotMode; }
  function formatTimecode(sec) {
    const s = Math.max(0, Number(sec) || 0);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0') + '.' + Math.floor((s % 1) * 10);
  }
  function showToast() {}
  function renderSurfaceList() {}
  function renderMaskList() {}
  function renderMediaBin() {}
  function renderCueList() {}
  function syncTopbarUI() {}
  function syncInspectorUI() {}
  function syncMaskInspectorUI() {}
  function syncFollowspotInspectorUI() {}
  function syncOutputInspectorUI() {}
  function syncTransportUI() {}
  function syncShaderStudioUI() {}
  function syncModIoInspectorUI() {}
  function renderModulatorsListUI() {}
  function renderMidiMappingsListUI() {}
  function syncOscReadoutOnly() {}
  function syncCueRecallToolbarUI() {}
  function openShaderStudioDrawer() {}
  function openRelinkModal() {}
  function renderRelinkDialogList() {}
  function refreshFxSelectDropdowns() {}
  function syncUndoButtonsUI() {}
  function updateRelinkBadgeUI() {}
  function scheduleAutosave() {}
  function setStageBackgroundDataUrl() {}
  function getWorkspacePanesLayout() {
    return {
      dpr: 1, w: 1280, h: 720,
      inputRect: { x: 0, y: 0, w: 640, h: 720 },
      stageRect: { x: 640, y: 0, w: 640, h: 720 },
      inputBox: { x: 20, y: 40, w: 600, h: 338 },
      stageBox: { x: 660, y: 40, w: 600, h: 338 }
    };
  }
  function selectSurface(id, syncActiveMedia = false) {
    state.selectedSurfaceId = id;
    state.selectedSurfaceIds = id ? [id] : [];
    const s = getSelectedSurface();
    if (s && syncActiveMedia) state.activeSourceId = s.sourceId;
  }
  function selectMask(id) { state.selectedMaskId = id; }
  function switchLeftTab(t) { state.leftTab = t; }
  function switchInspTab(t) { state.inspTab = t; }

  ${engineModulesSource}

  initBuiltInSources();
  initWebMapperPublicAPI();
  loadDemoScene(true);

  // ==========================================================================
  // 4. MILESTONES 1–4 CORE HOMOGRAPHY, CLONER, SVG, ISF v2 & UNDO/REDO
  // ==========================================================================
  {
    const quad = [[0.12, 0.18], [0.84, 0.22], [0.79, 0.86], [0.16, 0.78]];
    const hom = computeQuadHomography(quad);
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1], [0.35, 0.65]]) {
      const st = evalHomographyForward(hom.H, u, v);
      const back = evalHomographyInverse(hom.invColMajor, st[0], st[1]);
      assert(back && Math.abs(back[0] - u) < 1e-5 && Math.abs(back[1] - v) < 1e-5, '3x3 Homography forward/inverse round-trip accurate to <1e-5');
    }

    // Perspective Grid Cloner
    const beforeCount = state.surfaces.length;
    const baseQuad = state.surfaces.find(s => s.type === 'quad');
    selectSurface(baseQuad.id);
    const cloned = executeQuadGridClone(3, 2, 0.02, true, true);
    assert(cloned !== false, '3x2 Perspective Grid Cloner executed cleanly');
    assert.strictEqual(state.surfaces.length, beforeCount - 1 + 6, 'Original quad replaced by 6 cloned tiles');

    // Undo / Redo
    performUndo();
    assert.strictEqual(state.surfaces.length, beforeCount, 'performUndo restored pre-cloner surface count');
    performRedo();
    assert.strictEqual(state.surfaces.length, beforeCount + 5, 'performRedo re-applied 3x2 grid cloner');
    performUndo();

    // SVG Stage Template & SVG Importer
    const svgOut = buildStageTemplateSvgString();
    assert(svgOut.startsWith('<?xml') && svgOut.includes('<svg') && svgOut.includes('</svg>'), 'buildStageTemplateSvgString generates valid XML SVG');
    const importedCountBefore = state.surfaces.length;
    const svgSample = '<svg viewBox="0 0 1000 500"><polygon id="Arch" points="100,100 400,100 400,400 100,400"/><circle id="Dome" cx="700" cy="250" r="100"/></svg>';
    importSvgIntoScene(svgSample, 'surfaces', 'facade-test.svg');
    assert(state.surfaces.length >= importedCountBefore + 2, 'importSvgIntoScene created projection surfaces from SVG <polygon> & <circle>');

    // ISF v2 Shader Transpiler
    const sampleIsf = '/*{"DESCRIPTION":"Test","INPUTS":[{"NAME":"speed","TYPE":"float","DEFAULT":1.5,"MIN":0.0,"MAX":4.0}]}*/ void main() { gl_FragColor = vec4(isf_FragNormCoord, speed * 0.1, 1.0); }';
    const transpiled = transpileIsfToWebGL2(sampleIsf);
    assert(transpiled.ok && transpiled.fsSource.includes('#version 300 es') && transpiled.meta.inputs.length === 1 && transpiled.meta.inputs[0].name === 'speed',
      'transpileIsfToWebGL2 parsed JSON metadata & emitted WebGL2 #version 300 es fragment shader');
  }
  console.log('✓ [4/11] Core Homography, 3x2 Grid Cloner, 50-step Undo/Redo, SVG Importer/Exporter & ISF v2 Transpiler verified');

  // ==========================================================================
  // 5. MILESTONE 5 LIVE PERFORMANCE: SPATIAL MIX, CONSTELLATION, AUDIO/MIDI/OSC & TIMELINE
  // ==========================================================================
  loadDemoScene(true);
  {
    await enableAudioAnalyzer('synth');
    for (let i = 0; i < 8; i++) updateAudioAnalyzerFrame(0.04);
    assert(state.audio.bands.sub > 0 || state.audio.bands.high > 0, 'Synth Beat Engine populates FFT envelopes');

    // Verify Active Video Clip file://-safe native speaker audio + decoded PCM WebAudio FFT
    const mockVidEl = document.createElement('video');
    mockVidEl.muted = true;
    mockVidEl.volume = 0.75;
    mockVidEl.currentTime = 0.5;
    mockVidEl.playbackRate = 1.0;
    const pcmSamples = new Float32Array(48000 * 2);
    for (let i = 0; i < pcmSamples.length; i++) pcmSamples[i] = Math.sin((i / 48000) * Math.PI * 2 * 60) * 0.8;
    const mockVidSrc = {
      id: 'src_vid_test',
      name: 'Test Drum Loop',
      kind: 'video',
      video: mockVidEl,
      offline: false,
      playing: true,
      muted: true,
      volume: 0.75,
      rate: 1.0,
      hasAudioTrack: true,
      audioTrackSilent: false,
      _pcmAudio: {
        sampleRate: 48000,
        duration: 2.0,
        length: pcmSamples.length,
        channels: [pcmSamples]
      },
      width: 1920,
      height: 1080,
      texture: { id: 999 }
    };
    state.sources.push(mockVidSrc);
    state.activeSourceId = mockVidSrc.id;
    createdGainNodes.length = 0;
    createdBufferSources.length = 0;
    await enableAudioAnalyzer('video');
    assert.strictEqual(mockVidEl.muted, true, 'Native <video> stays muted when clip is muted (🔇)');
    assert.strictEqual(createdBufferSources.length, 1, 'Decoded _pcmAudio started time-synced AudioBufferSourceNode for FFT');
    assert(Math.abs(createdBufferSources[0].startedAtOffset - 0.5) < 1e-5, 'AudioBufferSourceNode synced to video.currentTime (0.5s)');
    const silentPullGain = createdGainNodes.find(g => g.gain.value === 0.0);
    assert(silentPullGain && silentPullGain.connections.some(c => c && c.kind === 'destination'),
      'liveAnalyser connects through 0.0-gain pull node to destination so WebKit/Chromium always pull FFT frames');
    const fftTapGain = createdGainNodes.find(g => g.gain.value === 1.0);
    assert(fftTapGain && fftTapGain.gain.value === 1.0, 'fftTapGain is 1.0 so FFT & Beat Detector work while speakers are muted!');
    assert(!fftTapGain.connections.some(c => c && c.kind === 'destination'),
      'Decoded FFT AudioBufferSourceNode must NEVER connect to AudioContext.destination (prevents double audio)');
    updateAudioAnalyzerFrame(0.04);
    assert(state.audio.bands.sub > 0.2, 'Active Video Clip populates live WebAudio FFT sub-bass band while muted');
    state.inspTab = 'mod';
    const fftCvs = document.getElementById('audio-fft-canvas');
    fftCvs._drawLog.length = 0;
    renderAudioSpectrumCanvas();
    assert(fftCvs._drawLog.filter(d => d[0] === 'fillRect').length >= 33, 'renderAudioSpectrumCanvas paints background + 32 live FFT spectrum bars');
    assert(BUILT_IN_DEMO_VIDEOS.drums.dataUrl.startsWith('data:video/mp4;base64,') && BUILT_IN_DEMO_VIDEOS.beams.dataUrl.startsWith('data:video/mp4;base64,'),
      'Both built-in H.264+AAC MP4 demo videos are embedded for 1-click offline playback');

    mockVidSrc.muted = false;
    syncVideoAudioElementState(mockVidSrc, true);
    assert.strictEqual(mockVidEl.muted, false, 'Unmuting video clip unmutes native <video> directly for OS speaker output');
    assert(Math.abs(mockVidEl.volume - 0.75) < 1e-5, 'Unmuting video clip sets native <video>.volume to 0.75');
    assert.strictEqual(getAudioSourceDiagnosticStatus().tone, 'ok');

    // Verify >250MB / .mov video clip (_pcmAudio === null) feeds FFT via captureStream() even on file://
    const mockStreamVidEl = document.createElement('video');
    mockStreamVidEl.readyState = 4;
    mockStreamVidEl.paused = false;
    mockStreamVidEl.muted = false;
    mockStreamVidEl.volume = 0.85;
    mockStreamVidEl.captureStream = () => ({
      getAudioTracks: () => [{ readyState: 'live', enabled: true, label: 'QuickTime Audio' }]
    });
    const mockMovSrc = {
      id: 'src_mov_stream',
      name: 'Large Stage Film.mov',
      kind: 'video',
      video: mockStreamVidEl,
      offline: false,
      playing: true,
      muted: false,
      volume: 0.85,
      rate: 1.0,
      hasAudioTrack: null,
      audioTrackSilent: false,
      _pcmAudio: null,
      width: 1920,
      height: 1080,
      texture: { id: 998 }
    };
    state.sources.push(mockMovSrc);
    state.audio.videoSourceId = mockMovSrc.id;
    attachActiveVideoToAudioGraph();
    assert.strictEqual(mockMovSrc.hasAudioTrack, true, 'captureStream() dynamically confirms hasAudioTrack=true for .mov/>250MB clips');
    const savedShowAudio = JSON.stringify(serializeShowData(false));
    state.audio.enabled = false;
    state.audio.sourceMode = 'synth';
    importShowJson(savedShowAudio, true);
    assert.strictEqual(state.audio.enabled, true, 'importShowJson restores audio.enabled=true across autosave reloads');
    assert.strictEqual(state.audio.sourceMode, 'video', 'importShowJson restores audio.sourceMode="video"');
    const restoredMov = state.sources.find(s => s.id === 'src_mov_stream');
    assert(restoredMov && restoredMov.muted === false, 'importShowJson preserves unmuted speaker state on video sources');

    // Verify screen-capture display audio & WebAudio stream binding
    const syphonSrc = await addScreenCaptureSource();
    assert(syphonSrc && syphonSrc.hasAudioTrack === true, 'addScreenCaptureSource captured display audio track');
    assert(lastDisplayMediaConstraints && lastDisplayMediaConstraints.audio && lastDisplayMediaConstraints.audio !== false,
      'addScreenCaptureSource requests display audio in getDisplayMedia');
    await enableAudioAnalyzer('syphon');
    assert.strictEqual(createdBufferSources[0].stopped, true, 'Switching to screen capture stops video FFT AudioBufferSourceNode cleanly');
    assert(createdStreamSources.length >= 1, 'Screen-capture MediaStream audio bound to WebAudio AnalyserNode');
    const syDiag = getAudioSourceDiagnosticStatus();
    assert(syDiag.tone === 'ok' && syDiag.text.includes('Analyzing captured audio'), 'Screen-capture audio diagnostic status confirms live stream audio');
    state.sources = state.sources.filter(s => s !== mockVidSrc && s !== syphonSrc);
    state.activeSourceId = 'src_shards';

    const surf0 = state.surfaces[0];
    addModulatorForTarget('surface:' + surf0.id + ':opacity', 'lfo', { waveform: 'sine', rateHz: 2.0, minVal: 0.25, maxVal: 0.85 });
    updateModulatorsFrame(0.1);
    assert(surf0.opacity >= 0.25 && surf0.opacity <= 0.85, 'Sine LFO drives surface opacity');
    clearModulatorsForTarget('surface:' + surf0.id + ':opacity');

    // Binary OSC #bundle
    const msgA = new Uint8Array(encodeOscMessage('/webmapper/master/opacity', [0.77]));
    const parsedOsc = decodeOscPacket(msgA.buffer);
    dispatchOscCommand(parsedOsc[0].address, parsedOsc[0].args);
    assert(Math.abs(state.masterOpacity - 0.77) < 1e-5, 'Binary OSC /webmapper/master/opacity updated state.masterOpacity');
    state.masterOpacity = 1.0;

    // Spatial mix + Constellation + Timeline
    const mixSrc = getMixbusSource();
    soloMixbusOrb(mixSrc, mixSrc.orbs[0].id);
    for (let i = 0; i < 25; i++) updateMixbusPhysics(mixSrc, 0.05);
    assert(Math.hypot(mixSrc.orbs[0].x, mixSrc.orbs[0].y) < 0.03, 'Solo orb glides to bullseye');

    state.cues = [];
    surf0.opacity = 0.2; storeNewCue();
    surf0.opacity = 1.0; storeNewCue();
    state.cues[0].constellationX = 0.2; state.cues[0].constellationY = 0.5;
    state.cues[1].constellationX = 0.8; state.cues[1].constellationY = 0.5;
    applyConstellationMorph(0.5, 0.5);
    assert(state.surfaces[0].opacity > 0.4 && state.surfaces[0].opacity < 0.8, 'Shepard 2D Cue Constellation morphs mid-point');

    const tlTrack = addTimelineTrackForTarget('master:opacity');
    tlTrack.keyframes = [
      { id: 'k1', time: 0, value: 0.2, curve: 'smooth' },
      { id: 'k2', time: 4, value: 1.0, curve: 'linear' }
    ];
    assert(Math.abs(evaluateTimelineTrackAt(tlTrack, 2.0) - 0.6) < 1e-5, 'Keyframe Timeline Hermite smooth midpoint verified');
  }
  console.log('✓ [5/11] Spatial Radar, Shepard 2D Constellation, Synth Beat Engine, Binary OSC & Keyframe Timeline verified');

  // ==========================================================================
  // 6. MILESTONE 6A: MULTI-PROJECTOR EDGE-BLENDING UNITY & GPU FRAME DELAY
  // ==========================================================================
  {
    // Verify Recommended Stage Resolution calculator
    const rec2x1 = computeRecommendedStageResForGrid('2x1', 0.15, 1920, 1080);
    assert.strictEqual(rec2x1.width, 3552, '2x1 @ 15% overlap of 1920x1080 = 3552px wide');
    assert.strictEqual(rec2x1.height, 1080, '2x1 @ 15% overlap of 1920x1080 = 1080px tall');
    assert.strictEqual(rec2x1.overlapPxX, 288, '15% of 1920px = 288px overlap');

    const rec2x2 = computeRecommendedStageResForGrid('2x2', 0.15, 1920, 1080);
    assert.strictEqual(rec2x2.width, 3552);
    assert.strictEqual(rec2x2.height, 1998);
    assert.strictEqual(rec2x2.overlapPxY, 162);

    // CRITICAL OPTICAL PROOF: Across ALL 5 array layouts ('1x1', '2x1', '3x1', '1x2', '2x2')
    // and 441 sample points (u, v) in [0, 1] x [0, 1], physical projector output intensity
    // sum_i (encodedMask_i ^ blendGamma) MUST equal 1.000000 (no bright seam, no dark trough, no 4-way corner dip!)
    const gamma = 2.2;
    for (const preset of ['1x1', '2x1', '3x1', '1x2', '2x2']) {
      const grid = computeEdgeBlendGridSlices(preset, 0.18);
      for (let iy = 0; iy <= 20; iy++) {
        const v = iy / 20;
        for (let ix = 0; ix <= 20; ix++) {
          const u = ix / 20;
          let physicalLuminanceSum = 0;
          for (const sl of grid.slices) {
            const w = evalRaisedCosineEdgeBlendWeight(u, v, sl, gamma);
            if (w.inBounds) {
              physicalLuminanceSum += Math.pow(w.encodedMask, gamma);
            }
          }
          assert(
            Math.abs(physicalLuminanceSum - 1.0) < 1e-4,
            \`Optical edge-blend unity failed for \${preset} at (\${u.toFixed(2)}, \${v.toFixed(2)}): got \${physicalLuminanceSum.toFixed(6)}\`
          );
        }
      }
    }

    // Apply 2x2 preset + recommended resolution, configure per-screen delay & keystone
    applyEdgeBlendLayoutPreset('2x2', 0.15, true, 1920, 1080);
    state.multiProjector.enabled = true;
    assert.strictEqual(state.multiProjector.screens.length, 4);
    assert.strictEqual(state.stageWidth, 3552);
    assert.strictEqual(state.stageHeight, 1998);

    state.multiProjector.screens[1].delayMs = 64;
    state.multiProjector.screens[1].gain = 0.92;
    state.multiProjector.screens[1].kelvin = -0.25;
    state.multiProjector.previewScreenIndex = 2;
    const activeSlice = getActiveProjectorSliceForRender();
    assert(activeSlice && activeSlice.index === 2 && activeSlice.delayMs === 64 && Math.abs(activeSlice.gain - 0.92) < 1e-5,
      'getActiveProjectorSliceForRender resolves Screen 2 slice, gain, kelvin & 64ms delay');

    // Pump GPU 14-slot frame delay ring buffer over virtual timestamps
    let t0 = resolveDelayedStageTexture(1920, 1080, 64, 1000);
    let t1 = resolveDelayedStageTexture(1920, 1080, 64, 1032);
    let t2 = resolveDelayedStageTexture(1920, 1080, 64, 1068);
    assert(t0 && t1 && t2 && t2 === t0, 'GPU 14-slot frame delay ring buffer retrieves exact frame from 68ms (>=64ms) ago');

    // Multi-screen popup launcher via getScreenDetails()
    openedPopups.length = 0;
    const launchedCount = await launchAllProjectorScreens();
    assert.strictEqual(launchedCount, 4, 'launchAllProjectorScreens opened all 4 projector windows');
    assert(openedPopups[0].url.includes('role=projector') && openedPopups[0].url.includes('screen=1'), 'Screen 1 URL tagged ?role=projector&screen=1');
    assert(openedPopups[3].url.includes('screen=4'), 'Screen 4 URL tagged ?role=projector&screen=4');

    // Verify >4 Multi-Projector Arrays (4x1, 6x1, 3x2), 75% Cross-Stage Overlap & Constant-Brightness Full Stacks
    for (const [preset, ov] of [['4x1', 0.15], ['6x1', 0.15], ['3x2', 0.20], ['2x1', 0.75], ['2x-stack', 1.0], ['3x-stack', 1.0]]) {
      const grid = computeEdgeBlendGridSlices(preset, ov, 2.2);
      for (const u of [0.05, 0.25, 0.50, 0.75, 0.95]) {
        for (const v of [0.15, 0.50, 0.85]) {
          let lumSum = 0;
          for (const sl of grid.slices) {
            lumSum += evalRaisedCosineEdgeBlendWeight(u, v, sl, 2.2).physicalLum;
          }
          assert(Math.abs(lumSum - 1.0) < 1e-3, 'Optical unity failed for ' + preset + ' (ov=' + ov + ') at (' + u + ',' + v + '): got ' + lumSum);
        }
      }
    }
    applyEdgeBlendLayoutPreset('6x1', 0.15, true, 1920, 1080);
    assert.strictEqual(state.multiProjector.screens.length, 6, '6x1 panorama creates 6 projector screens');
    assert(state.stageWidth > 8000 && state.stageWidth <= 8192, '6x1 1080p panorama expands Canonical Stage up to 8K FBO');
    addCustomProjectorScreen({ name: 'Stage Side Fill 7' });
    assert.strictEqual(state.multiProjector.screens.length, 7, 'addCustomProjectorScreen adds 7th projector screen');
    removeProjectorScreen(7);
    assert.strictEqual(state.multiProjector.screens.length, 6, 'removeProjectorScreen cleanly removes 7th screen');
    applyEdgeBlendLayoutPreset('6x1', 0.15, true, 1920, 1080);
    state.multiProjector.screens[1].delayMs = 64;
    state.multiProjector.previewScreenIndex = 0;
  }
  console.log('✓ [6/11] Multi-Projector Optical Edge-Blend Unity (1x1..6x1, 3x2, 75% Cross-Overlap & Constant-Brightness Stacks), GPU Delay Ring & N-Screen Launch verified');

  // ==========================================================================
  // 7. MILESTONE 6B: LED PIXEL MAPPER, SERPENTINE, ROLLOVER, USB-DMX & ART-NET
  // ==========================================================================
  {
    ensurePixelMapperState();
    state.pixelMapper.fixtures = [];
    state.pixelMapper.nextFixtureNum = 1;

    // 16x16 RGB Matrix (256 pixels = 768 channels) -> MUST roll over Universe 0 at Ch 510 (pixel 169)
    // so pixel 170 starts cleanly at Universe 1, Ch 1 without splitting R/G/B across universes!
    const matFix = addDmxFixture('matrix', {
      name: 'Main Wall 16x16',
      universe: 0,
      startChannel: 1,
      cols: 16,
      rows: 16,
      serpentine: true,
      colorOrder: 'RGB',
      cx: 0.5, cy: 0.5, width: 0.8, height: 0.8
    });
    const endSpan = computeFixtureEndPatch(matFix);
    assert.strictEqual(endSpan.endUniverse, 1, '16x16 RGB matrix (768ch) rolls over cleanly into Universe 1');
    assert.strictEqual(endSpan.endChannel, 258, '86 remaining pixels * 3ch = Ch 258 in Universe 1 (zero split pixels!)');

    const patches = [];
    forEachFixturePixelPatch(matFix, (p, uni, ch) => patches.push({ p, uni, ch }));
    assert.strictEqual(patches[169].uni, 0);
    assert.strictEqual(patches[169].ch, 508); // 508, 509, 510! (Ch 511 & 512 skipped so pixel 170 isn't split!)
    assert.strictEqual(patches[170].uni, 1);
    assert.strictEqual(patches[170].ch, 1);

    // Verify Serpentine Zig-Zag row reversal on odd rows
    const matCoords = computeFixturePixelStageCoords(matFix);
    // Row 0 (even): pixel 0 is far-left (x = 0.1), pixel 15 is far-right (x = 0.9)
    // Row 1 (odd, serpentine=true): pixel 16 is far-right (x = 0.9), pixel 31 is far-left (x = 0.1)
    assert(Math.abs(matCoords[0] - 0.1) < 1e-5 && Math.abs(matCoords[15 * 2] - 0.9) < 1e-5, 'Matrix row 0 runs left -> right');
    assert(Math.abs(matCoords[16 * 2] - 0.9) < 1e-5 && Math.abs(matCoords[31 * 2] - 0.1) < 1e-5, 'Serpentine Matrix row 1 reverses right -> left');

    // Auto-patch second fixture (Ring) -> must start at Universe 1, Ch 259 with ZERO collisions
    const ringFix = addDmxFixture('ring', { pixelCount: 12, colorOrder: 'RGBW' });
    assert.strictEqual(ringFix.universe, 1);
    assert.strictEqual(ringFix.startChannel, 259);
    let colReport = detectFixtureDmxCollisions(state.pixelMapper.fixtures);
    assert.strictEqual(colReport.collisionCount, 0, 'Auto-patched fixtures have zero DMX channel collisions');

    // Intentionally overlap a third Strip at Universe 0, Ch 1 -> collision detector must flag!
    const collidingStrip = addDmxFixture('strip', { universe: 0, startChannel: 1, pixelCount: 4, colorOrder: 'RGB' });
    colReport = detectFixtureDmxCollisions(state.pixelMapper.fixtures);
    assert.strictEqual(colReport.collisionCount, 12, '4 RGB pixels overlapping Universe 0 Ch 1..12 flagged as 12 channel collisions');
    removeDmxFixture(collidingStrip.id);

    // Verify all 6 color orders (RGB, GRB, BGR, RGBW, Luma, RGB16) with gamma = 1.0 for exact byte math
    const solidBuf = new Uint8Array(4 * 4 * 4);
    for (let i = 0; i < solidBuf.length; i += 4) {
      solidBuf[i] = 200;     // R
      solidBuf[i + 1] = 100; // G
      solidBuf[i + 2] = 50;  // B
      solidBuf[i + 3] = 255;
    }
    const orderFixtures = [
      createDmxFixture('strip', { universe: 2, startChannel: 1, pixelCount: 1, colorOrder: 'RGB' }),
      createDmxFixture('strip', { universe: 2, startChannel: 10, pixelCount: 1, colorOrder: 'GRB' }),
      createDmxFixture('strip', { universe: 2, startChannel: 20, pixelCount: 1, colorOrder: 'BGR' }),
      createDmxFixture('strip', { universe: 2, startChannel: 30, pixelCount: 1, colorOrder: 'RGBW' }),
      createDmxFixture('strip', { universe: 2, startChannel: 40, pixelCount: 1, colorOrder: 'Luma' }),
      createDmxFixture('strip', { universe: 2, startChannel: 50, pixelCount: 1, colorOrder: 'RGB16' })
    ];
    const packed = packFixturesIntoDmxUniverses(solidBuf, 4, 4, orderFixtures, 1.0, 1.0);
    const u2 = packed.get(2);
    assert.deepStrictEqual([...u2.subarray(0, 3)], [200, 100, 50], 'RGB order');
    assert.deepStrictEqual([...u2.subarray(9, 12)], [100, 200, 50], 'GRB WS2812 order');
    assert.deepStrictEqual([...u2.subarray(19, 22)], [50, 100, 200], 'BGR APA102 order');
    assert.deepStrictEqual([...u2.subarray(29, 33)], [150, 50, 0, 50], 'RGBW white-extraction order');
    assert(u2[39] > 110 && u2[39] < 120, 'Luma BT.709 1ch dimmer order');
    assert(u2[49] === 200 && u2[51] === 100 && u2[53] === 50, 'RGB16 coarse/fine 6ch order');

    // Verify ENTTEC DMX USB Pro binary packet (518 B) & Art-Net OpDmx 0x5000 binary packet (530 B)
    const enttec = encodeEnttecProPacket(u2);
    assert.strictEqual(enttec.length, 518);
    assert.strictEqual(enttec[0], 0x7E);
    assert.strictEqual(enttec[1], 0x06);
    assert.strictEqual(enttec[2], 0x01); // 513 & 0xFF
    assert.strictEqual(enttec[3], 0x02); // 513 >> 8
    assert.strictEqual(enttec[4], 0x00); // Start code
    assert.strictEqual(enttec[5], 200);  // Ch 1 = 200
    assert.strictEqual(enttec[517], 0xE7);

    const artDmx = encodeArtDmxPacket(3, u2, 42, 1, 2);
    assert.strictEqual(artDmx.length, 530);
    assert.strictEqual(String.fromCharCode(...artDmx.subarray(0, 7)), 'Art-Net');
    assert.strictEqual(artDmx[7], 0x00);
    assert.strictEqual(artDmx[8], 0x00);
    assert.strictEqual(artDmx[9], 0x50); // OpDmx 0x5000 little-endian
    assert.strictEqual(artDmx[11], 14);  // ProtVer 14
    assert.strictEqual(artDmx[12], 42);  // Sequence
    assert.strictEqual(artDmx[14], (2 << 4) | 3); // SubUni
    assert.strictEqual(artDmx[15], 1);   // Net
    assert.strictEqual(artDmx[16], 0x02); // Length 512 MSB
    assert.strictEqual(artDmx[17], 0x00); // Length 512 LSB
    assert.strictEqual(artDmx[18], 200); // Ch 1 = 200

    // Live WebSerial + Art-Net WebSocket frame pump via updatePixelMapperFrame()
    mockReadPixelsPainter = (_x, _y, _w, _h, dst) => {
      for (let i = 0; i < dst.length; i += 4) {
        dst[i] = 255; dst[i + 1] = 128; dst[i + 2] = 64; dst[i + 3] = 255;
      }
    };
    const serialOk = await connectWebSerialDmx();
    assert.strictEqual(serialOk, true, 'connectWebSerialDmx opened mock ENTTEC Pro serial port');
    const wsSentPackets = [];
    oscSocket = { readyState: 1, send(pkt) { wsSentPackets.push(new Uint8Array(pkt)); } };
    state.pixelMapper.artNetEnabled = true;
    state.inspTab = 'output';
    updatePixelMapperFrame(0.05); // > 1/44s interval
    await Promise.resolve();
    assert(serialWrittenPackets.length >= 1 && serialWrittenPackets[0].length === 518, 'WebSerial streamed 518-byte ENTTEC Pro packet');
    assert(wsSentPackets.length >= 2 && wsSentPackets[0].length === 530, 'Art-Net streamed 530-byte OpDmx packets for active universes');
    await disconnectWebSerialDmx(true);
    oscSocket = null;
    mockReadPixelsPainter = null;
  }
  console.log('✓ [7/11] LED Pixel Mapper (Serpentine Matrix, Universe Rollover, 6 Color Orders, ENTTEC USB-DMX & Art-Net OpDmx) verified');

  // ==========================================================================
  // 8. MILESTONE 6C: PUBLIC EXTENSION API (window.WebMapperAPI) & SHOW v2.0 IO
  // ==========================================================================
  {
    const api = window.WebMapperAPI;
    assert(api && Object.isFrozen(api), 'window.WebMapperAPI is exposed and frozen');
    assert.strictEqual(api.version, '2.0.0');
    assert.strictEqual(api.license, 'AGPL-3.0-or-later');

    const events = [];
    const offPlugin = api.on('pluginRegistered', e => events.push(['plugin', e.kind]));
    const offCue = api.on('cue', e => events.push(['cue', e.id]));

    // 1. Register Custom ISF Generator
    const genRes = api.registerGenerator({
      name: 'API Aurora Test',
      author: 'Suite',
      isfCode: '/*{"DESCRIPTION":"Aurora","INPUTS":[]}*/ void main() { gl_FragColor = vec4(0.2, 0.8, 1.0, 1.0); }'
    });
    assert.strictEqual(genRes.ok, true, 'WebMapperAPI.registerGenerator compiled & registered custom generator');

    // 2. Register Custom Post-FX Plugin
    const fxRes = api.registerEffect({
      id: 'api_tint_boost',
      name: 'API Tint Boost',
      isfCode: '/*{"DESCRIPTION":"Boost","INPUTS":[{"NAME":"amt","TYPE":"float","DEFAULT":0.5,"MIN":0.0,"MAX":1.0}]}*/ void main() { vec4 c = IMG_NORM_PIXEL(inputImage, isf_FragNormCoord); gl_FragColor = vec4(c.rgb * (1.0 + amt), c.a); }'
    });
    assert.strictEqual(fxRes.ok, true, 'WebMapperAPI.registerEffect compiled & registered custom GPU effect');

    // 3. Register Custom Modulator Evaluator & Drive dmx:masterDimmer
    const modReg = api.registerModulator('euclidean_pulse', (_mod, _dt, ctx) => (ctx.bpm > 100 ? 0.75 : 0.25), { label: 'Euclidean Pulse' });
    assert.strictEqual(modReg.ok, true);
    const modInst = api.addModulator({ targetKey: 'dmx:masterDimmer', kind: 'euclidean_pulse', minVal: 0.2, maxVal: 0.8 });
    assert.strictEqual(modInst.ok, true);
    state.audio.bpm = 128;
    updateModulatorsFrame(0.05);
    // 0.2 + 0.75 * (0.8 - 0.2) = 0.65
    assert(Math.abs(api.getParam('dmx:masterDimmer') - 0.65) < 1e-4, 'Custom modulator registered via WebMapperAPI drove dmx:masterDimmer to 0.65');

    // 4. Register Phase 7 Assistant Provider Hook (Zero cloud dependencies in core!)
    const aiReg = api.registerAssistantProvider({
      id: 'local-isf-copilot',
      name: 'Local ISF Shader Copilot',
      capabilities: ['isf-shader', 'svg-mask']
    });
    assert.strictEqual(aiReg.ok, true);
    assert.strictEqual(api.getAssistantProviders().length, 1);
    assert.strictEqual(api.getAssistantProviders()[0].id, 'local-isf-copilot');

    // 5. Scene Summary, SVG Template, Cue Trigger & DMX Universe Snapshot
    const summary = api.getStateSummary();
    assert.strictEqual(summary.version, '2.0.0');
    assert(summary.pixelMapper.fixtureCount >= 2 && summary.multiProjector.screens.length === 6);
    assert(api.getStageUvTemplateSvg().includes('<svg'));
    assert.strictEqual(api.getDmxUniverseSnapshot(0).length, 512);
    assert.strictEqual(api.triggerCue(0), true);
    assert(events.some(e => e[0] === 'plugin' && e[1] === 'generator'), 'pluginRegistered event fired');
    assert(events.some(e => e[0] === 'cue'), 'cue event fired');
    offPlugin();
    offCue();

    // 6. Full v2.0 Show Export / Blank Reset / Import Round-Trip
    const exported = api.exportShow(false);
    loadBlankScene(true);
    assert.strictEqual(state.multiProjector.enabled, false);
    assert.strictEqual(state.pixelMapper.fixtures.length, 0);

    api.importShow(exported);
    assert.strictEqual(state.multiProjector.enabled, true, 'Show v2.0 import restored multiProjector.enabled');
    assert.strictEqual(state.multiProjector.layoutPreset, '6x1', 'Show v2.0 import restored 6x1 array layout');
    assert.strictEqual(state.multiProjector.screens.length, 6, 'Show v2.0 import restored all 6 projector screens');
    assert.strictEqual(state.multiProjector.screens[1].delayMs, 64, 'Show v2.0 import restored per-projector 64ms delay');
    assert.strictEqual(state.pixelMapper.fixtures.length, 2, 'Show v2.0 import restored DMX fixtures');
    assert.strictEqual(state.pixelMapper.fixtures[0].cols, 16, 'Show v2.0 import restored 16x16 DMX Matrix');
  }
  console.log('✓ [8/11] Frozen window.WebMapperAPI (Generators, Effects, Custom Modulators, Phase 7 AI Hook & Show v2.0 IO) verified');

  // ==========================================================================
  // 9. PHASE 7A: 3D MESH PRIMITIVES, .OBJ IMPORTER & 6-POINT solvePnP ENGINE
  // ==========================================================================
  {
    // 1. Verify all 7 built-in scenic 3D primitives
    const primKeys = ['cube', 'steps', 'pyramid', 'cylinder', 'sphere', 'torus', 'stage_cyc'];
    for (const pk of primKeys) {
      const m = buildPrimitiveMesh3D(pk);
      assert(m && m.triCount > 0, 'Primitive ' + pk + ' has positive triangle count');
      assert.strictEqual(m.verts.length, m.triCount * 3 * 11, 'Primitive ' + pk + ' interleaved stride is 11 floats/vertex');
      assert(m.uniqueVerts.length >= 4 && m.edges.length >= 6, 'Primitive ' + pk + ' populates uniqueVerts & exterior edges');
      for (let i = 0; i < m.verts.length; i++) {
        assert(Number.isFinite(m.verts[i]), 'Primitive ' + pk + ' has finite float attributes');
      }
    }
    // Cube has 6 quad faces = 12 triangles, but internal quad diagonals must be suppressed -> 12 exterior edges!
    const cubeM = buildPrimitiveMesh3D('cube');
    assert.strictEqual(cubeM.triCount, 12);
    assert.strictEqual(cubeM.uniqueVerts.length, 8);
    assert.strictEqual(cubeM.edges.length, 12, 'Cube suppresses internal quad diagonals (12 clean exterior edges)');

    // 2. Verify zero-dependency .OBJ parser (quads, pentagons, negative indices, box UV fallback)
    const sampleObj = [
      '# Scenic Hexagonal Prism / Wedge Test',
      'v -1.0 -1.0  1.0',
      'v  1.0 -1.0  1.0',
      'v  1.0  1.0  1.0',
      'v -1.0  1.0  1.0',
      'v -1.0 -1.0 -1.0',
      'v  1.0 -1.0 -1.0',
      'v  0.0  1.4 -1.0',
      'f 1 2 3 4',
      'f 5 7 6',
      'f -7 -3 -1 -6',
      'f 2 6 7 3'
    ].join('\\n');
    const parsedObj = parseObjMesh(sampleObj, 'scenic-wedge.obj');
    assert(parsedObj && parsedObj.triCount === 7, 'OBJ parser fan-triangulated 3 quads + 1 tri = 7 triangles');
    assert.strictEqual(parsedObj.uniqueVerts.length, 7, 'OBJ parser extracted 7 unique normalized 3D vertices');

    // 3. Synthetic 6-Point Off-Axis Lens-Shifted Projector solvePnP6PointDLT Verification
    const stepsMesh = buildPrimitiveMesh3D('steps');
    const camTrueEye = [0.68, 0.52, 3.15];
    const viewTrue = mat4LookAt(camTrueEye, [-0.05, 0.04, 0.0], [0, 1, 0]);
    const projTrue = mat4ProjectorFrustum(1.55, 16 / 9, 0.12, 0.18, 0.08, 40.0);
    const mvpTrue = mat4Multiply(new Float32Array(16), projTrue, viewTrue);

    // Pick 8 non-coplanar vertices across X, Y, Z of the Stepped Podium
    const testSurf3D = createSurface('mesh3d', { mesh3dPrimitive: 'steps' });
    const orbitCheck = computeOrbitMvp({ yaw: -34, pitch: 22, dist: 2.85, panX: 0, panY: 0 }, 4 / 3);
    const orbitOriginClip = projectPoint3DWithMvp([0, 0, 0], orbitCheck.mvp);
    assert(!orbitOriginClip.behind && orbitOriginClip.ndcZ >= -1.0 && orbitOriginClip.ndcZ <= 1.0,
      'computeOrbitMvp maps 3D origin inside [-1, 1] WebGL2 clip-space depth, got ndcZ=' + orbitOriginClip.ndcZ);
    const manualCheck = computeManualSurface3DMvp(testSurf3D, 16 / 9);
    const manualOriginClip = projectPoint3DWithMvp([0, 0, 0], manualCheck.mvp);
    assert(!manualOriginClip.behind && manualOriginClip.ndcZ >= -1.0 && manualOriginClip.ndcZ <= 1.0,
      'computeManualSurface3DMvp maps 3D origin inside [-1, 1] WebGL2 clip-space depth, got ndcZ=' + manualOriginClip.ndcZ);
    const seedPins = autoSeed6CalibrationPins(testSurf3D, 16 / 9);
    assert.strictEqual(seedPins.length, 6, 'autoSeed6CalibrationPins selected 6 spread 3D vertices');
    const synthPins = seedPins.map(sp => {
      const pr = projectPoint3DWithMvp(sp.pos3d, mvpTrue);
      return { pos3d: sp.pos3d, stage2d: [pr.u, pr.v] };
    });
    // Add 2 extra vertices for overdetermined 8-point DLT precision check
    for (const extraIdx of [2, 9]) {
      if (stepsMesh.uniqueVerts[extraIdx]) {
        const p3 = stepsMesh.uniqueVerts[extraIdx];
        const pr = projectPoint3DWithMvp(p3, mvpTrue);
        synthPins.push({ pos3d: p3, stage2d: [pr.u, pr.v] });
      }
    }

    const pnpRes = solvePnP6PointDLT(synthPins, 1920, 1080);
    assert.strictEqual(pnpRes.ok, true, 'solvePnP6PointDLT succeeded on off-axis lens-shifted 3D correspondences');
    assert(pnpRes.rmsPx < 0.02, 'solvePnP6PointDLT achieved sub-0.02px RMS reprojection error, got ' + pnpRes.rmsPx);
    const camErr = Math.hypot(
      pnpRes.camCenter[0] - camTrueEye[0],
      pnpRes.camCenter[1] - camTrueEye[1],
      pnpRes.camCenter[2] - camTrueEye[2]
    );
    assert(camErr < 0.02, 'Givens RQ recovered true 3D projector optical center within 0.02 units, err=' + camErr);
    assert(Math.abs(pnpRes.throwRatio - 1.55) < 0.03, 'Givens RQ recovered 1.55:1 throw ratio, got ' + pnpRes.throwRatio);
    assert(Math.abs(pnpRes.lensShiftX - 0.12) < 0.03 && Math.abs(pnpRes.lensShiftY - 0.18) < 0.03,
      'Givens RQ recovered off-axis projector lens shift (12%, 18%)');

    // Verify coplanar degeneracy guard (all Z = 0 must reject DLT cleanly rather than exploding)
    const coplanarPins = [
      { pos3d: [-1, -1, 0], stage2d: [0.2, 0.2] },
      { pos3d: [ 1, -1, 0], stage2d: [0.8, 0.2] },
      { pos3d: [ 1,  1, 0], stage2d: [0.8, 0.8] },
      { pos3d: [-1,  1, 0], stage2d: [0.2, 0.8] },
      { pos3d: [ 0, -1, 0], stage2d: [0.5, 0.2] },
      { pos3d: [ 0,  1, 0], stage2d: [0.5, 0.8] }
    ];
    const coplanarRes = solvePnP6PointDLT(coplanarPins, 1920, 1080);
    assert.strictEqual(coplanarRes.ok, false, 'solvePnP6PointDLT cleanly rejects coplanar 3D pin sets');

    // 4. Verify WebMapperAPI 3D methods, Modulation, SVG Export & Show JSON Persistence
    const api = window.WebMapperAPI;
    const torusId = api.add3DSurface('torus', { name: 'Stage Torus' });
    const torusSurf = state.surfaces.find(s => s.id === torusId);
    assert(torusSurf && torusSurf.type === 'mesh3d' && torusSurf.mesh3dPrimitive === 'torus', 'WebMapperAPI.add3DSurface created torus mesh3d surface');

    const objSurfId = api.importObjSurface(sampleObj, 'scenic-wedge.obj');
    assert(typeof objSurfId === 'string' && objSurfId.length > 0, 'WebMapperAPI.importObjSurface imported custom .obj surface');
    const objSurf = state.surfaces.find(s => s.id === objSurfId);
    assert(objSurf && objSurf.type === 'mesh3d' && objSurf.objAssetId, 'Imported .obj surface registered in state.surfaces & state.objAssets');

    objSurf.calibPins = synthPins.slice(0, 6);
    const apiPnp = api.solveSurfacePnP(objSurf.id);
    assert.strictEqual(apiPnp.ok, true, 'WebMapperAPI.solveSurfacePnP calibrated 3D surface');

    // Modulate 3D wireChase via LFO
    addModulatorForTarget('surface:' + objSurf.id + ':wireChase', 'lfo', { waveform: 'sine', rateHz: 1.5, minVal: 0.4, maxVal: 1.8 });
    updateModulatorsFrame(0.1);
    assert(objSurf.wireChase >= 0.4 && objSurf.wireChase <= 1.8, 'LFO modulates 3D wireChase parameter');

    // SVG template includes projected 3D wireframe <line> segments
    const svg3d = buildStageTemplateSvgString();
    assert(svg3d.includes('<line '), 'buildStageTemplateSvgString renders projected 3D wireframe edges');

    // Show JSON v2.0 round-trip preserves custom .obj assets & 6-Pt PnP calibration pins
    const saved3dJson = api.exportShow(false);
    loadBlankScene(true);
    assert.strictEqual(Object.keys(state.objAssets || {}).length, 0);
    api.importShow(saved3dJson);
    const restoredObjSurf = state.surfaces.find(s => s.id === objSurfId);
    assert(restoredObjSurf && restoredObjSurf.type === 'mesh3d' && restoredObjSurf.calibMode === 'calibrated',
      'importShow restored calibrated mesh3d surface');
    assert.strictEqual(restoredObjSurf.calibPins.length, 6, 'importShow restored 6 PnP calibration pins');
    assert(state.objAssets && state.objAssets[restoredObjSurf.objAssetId], 'importShow restored embedded custom .obj asset');
  }
  console.log('✓ [9/11] Phase 7A 3D Engine (7 Primitives, .OBJ Importer, Off-Axis 6-Pt solvePnP + Givens RQ, 3D Modulation & Show IO) verified');

  // ==========================================================================
  // 10. PHASE 7B: 2D/3D VISUAL STAGE PLAN & CONSTANT-BRIGHTNESS CROSS-SOLVER
  // ==========================================================================
  {
    const api = window.WebMapperAPI;
    loadBlankScene(true);

    // 1. Apply Opposing Cross-Stage Wings preset & verify exact 3x3 StageUV <-> ProjUV homography round-trip
    // (including non-zero rollDeg = 23° + off-axis lens shift!)
    const presetRes = api.applyStagePlanPreset('opposing_wings_constant', true);
    assert.strictEqual(presetRes.ok, true, 'WebMapperAPI.applyStagePlanPreset(opposing_wings_constant) succeeded');
    assert.strictEqual(presetRes.screenCount, 2, 'Opposing Cross-Stage Wings configures 2 physical wing projectors');
    assert(presetRes.coveragePct > 90, 'Opposing wings illuminate >90% of Stage Screen, got ' + presetRes.coveragePct);
    assert(presetRes.overlapPct > 70, 'Opposing wings share >70% cross-stage overlap, got ' + presetRes.overlapPct);
    assert(presetRes.uniformityPct > 98.5, 'Constant-Brightness Solver achieves >98.5% physical lux uniformity across oblique opposing wings, got ' + presetRes.uniformityPct);

    // Test rolled + lens-shifted projector homography exactness: projToStageMat3 * stageToProjMat3 = I (projectively)
    const rolledTestScr = createProjectorScreenSlice(1, {
      posM: [-3.1, 2.75, 4.4],
      aimM: [0.25, 2.15, 0.0],
      rollDeg: 23.0,
      throwRatio: 0.92,
      lensShiftX: 0.14,
      lensShiftY: -0.11,
      lumens: 10000
    });
    const optRoll = computeProjectorOptics3D(rolledTestScr, state.multiProjector);
    assert.strictEqual(optRoll.homographyValid, true, 'computeProjectorOptics3D produces invertible 3x3 homography for rolled oblique projector');
    for (const [su, sv] of [[0.15, 0.20], [0.50, 0.50], [0.82, 0.76]]) {
      const mF = optRoll.stageToProjMat3;
      const qx = mF[0] * su + mF[3] * sv + mF[6];
      const qy = mF[1] * su + mF[4] * sv + mF[7];
      const qz = mF[2] * su + mF[5] * sv + mF[8];
      const pu = qx / qz, pv = qy / qz;
      const mI = optRoll.projToStageMat3;
      const bx = mI[0] * pu + mI[3] * pv + mI[6];
      const by = mI[1] * pu + mI[4] * pv + mI[7];
      const bz = mI[2] * pu + mI[5] * pv + mI[8];
      assert(Math.abs(bx / bz - su) < 1e-4 && Math.abs(by / bz - sv) < 1e-4,
        'Rolled + lens-shifted 3x3 Stage<->Projector homography round-trips within 1e-4');
    }

    // 2. Verify Asymmetric ANSI Lumens Normalization (12,000 lm Left Wing vs 6,000 lm Right Wing)
    api.setProjectorPose(1, { lumens: 12000 });
    api.setProjectorPose(2, { lumens: 6000 });
    const leftSample = evalStagePlanConstantBrightnessAt(0.28, 0.50);
    const midSample  = evalStagePlanConstantBrightnessAt(0.50, 0.50);
    const rightSample = evalStagePlanConstantBrightnessAt(0.72, 0.50);
    assert(
      Math.abs(leftSample.totalPhysicalLux - midSample.totalPhysicalLux) / midSample.targetConstLux < 0.02 &&
      Math.abs(rightSample.totalPhysicalLux - midSample.totalPhysicalLux) / midSample.targetConstLux < 0.02,
      'Constant-Brightness Solver equalizes physical wall lux within <2% across Left (0.28), Center (0.50), and Right (0.72) despite 2:1 lumen mismatch & oblique 1/d^2 falloff!'
    );

    // 3. Verify 3D Scenic Mesh Shadow-Occlusion Compensation:
    // Place a 3D Box prop directly on P1 Wing Left's ray (-3.25, 2.55, 2.35) -> Stage Center (0, 2.3375, -2.6),
    // midpoint (-1.625, 2.444, -0.125), while leaving P2 Wing Right (+3.25, 2.55, 2.35) completely clear!
    const blockerSurf = createSurface('mesh3d', {
      name: 'Stage Left Scenic Pillar',
      mesh3dPrimitive: 'cube',
      pos3d: [-0.96, 0.06, 0.87],
      rot3d: [0, 0, 0],
      scale3d: [0.35, 0.55, 0.35]
    });
    state.surfaces.push(blockerSurf);
    solveStagePlanOpticalField(state.multiProjector, true);
    const shadowSample = evalStagePlanConstantBrightnessAt(0.50, 0.50);
    assert.strictEqual(shadowSample.perScreen[0].occluded, true, '3D Ray-Mesh occluder detected Stage Left projector shadow at center stage');
    assert.strictEqual(shadowSample.perScreen[1].occluded, false, 'Stage Right wing projector has clear line-of-sight around 3D prop');
    assert(shadowSample.perScreen[1].linearDrive > midSample.perScreen[1].linearDrive * 1.25,
      'Un-occluded Stage Right projector automatically boosted linear drive to fill 3D shadow');
    state.surfaces = state.surfaces.filter(s => s.id !== blockerSurf.id);
    solveStagePlanOpticalField(state.multiProjector, true);

    // 4. Verify Stage Plan Show JSON Serialization & Restore Round-Trip
    const savedPlanJson = api.exportShow(false);
    loadBlankScene(true);
    assert(!state.multiProjector.stagePlan || state.multiProjector.stagePlan.enabled === false);
    api.importShow(savedPlanJson);
    assert.strictEqual(state.multiProjector.enabled, true, 'importShow restored multiProjector.enabled');
    assert.strictEqual(state.multiProjector.stagePlan.enabled, true, 'importShow restored stagePlan.enabled');
    assert.strictEqual(state.multiProjector.screens[0].lumens, 12000, 'importShow restored P1 12000 ANSI lumens');
    assert.strictEqual(state.multiProjector.screens[1].lumens, 6000, 'importShow restored P2 6000 ANSI lumens');
  }
  console.log('✓ [10/11] Phase 7B 2D/3D Stage Plan (3x3 Oblique/Rolled Homography, Constant-Brightness Lux Solver, 3D Shadow Fill & Show IO) verified');

  // ==========================================================================
  // 11. PHASE 7C: "VIDEO AS LIGHT" — 3D CONVERGENT FOLLOWSPOT, GOBO & SHUTTERS
  // ==========================================================================
  {
    const api = window.WebMapperAPI;
    api.applyStagePlanPreset('triple_stage_wrap', true);
    assert.strictEqual(state.multiProjector.screens.length, 3, 'Triple Concert Stage rig has 3 physical projectors (FOH + L/R Wings)');

    // 1. Exact 3D Euclidean Ray-Intersection Proof for Multi-Projector Convergent Followspot:
    // Place performer at spotX = 0.38, spotY = 0.48, standing 1.65m downstage in front of Z=0 wall.
    // Every projector i's ray from eye_i to wallHit_i MUST pass directly through P_performer within < 1e-5 meters!
    api.setFollowspot3DTarget({
      mode: 'veil',
      converge3D: true,
      maskBgSpill: true,
      spotX: 0.38,
      spotY: 0.48,
      performerDepthM: 1.65,
      performerHeightM: 1.80,
      performerRadiusM: 0.42
    });
    const perfWorld = getPerformer3DWorldCenterM(state.followspot, state.multiProjector);
    const wallHitsX = [];
    for (const scr of state.multiProjector.screens) {
      const conv = computeConvergentSpotForProjector(state.followspot, scr.index, state.multiProjector);
      wallHitsX.push(conv.followspot.spotX);
      assert(conv.bgMask[3] > 0.5, 'maskBgSpill activates background wall spill attenuation outside convergent beam');

      // Distance from 3D point perfWorld to line segment (eye -> wallWorldM) must be 0.00000m!
      const ex = scr.posM[0], ey = scr.posM[1], ez = scr.posM[2];
      const wx = conv.wallWorldM[0], wy = conv.wallWorldM[1], wz = conv.wallWorldM[2];
      const vx = wx - ex, vy = wy - ey, vz = wz - ez;
      const px = perfWorld.x - ex, py = perfWorld.y - ey, pz = perfWorld.z - ez;
      const cx = vy * pz - vz * py;
      const cy = vz * px - vx * pz;
      const cz = vx * py - vy * px;
      const distRayToPerformerM = Math.hypot(cx, cy, cz) / Math.hypot(vx, vy, vz);
      assert(distRayToPerformerM < 1e-5,
        'Projector P' + scr.index + ' convergent followspot ray misses 3D performer by ' + distRayToPerformerM);
    }
    // Left Wing and Right Wing projectors MUST hit different X coordinates on the Z=0 back wall due to 3D parallax!
    assert(Math.abs(wallHitsX[1] - wallHitsX[2]) > 0.25,
      'Opposing Left & Right wing projectors apply distinct 3D parallax offsets on stage wall to converge on performer');

    // 2. Verify Built-In Stage Gobo Light ('src_videolight') & 4-Blade Framing Shutters + Modulation + Cue Recall
    const goboSrc = state.sources.find(s => s.id === 'src_videolight');
    assert(goboSrc && goboSrc.shaderKind === 'videolight', 'Built-in Stage Gobo Light (src_videolight) registered in Media Bin');

    const lightQuad = createSurface('quad', { name: 'Profile Special 1', sourceId: 'src_videolight', blendMode: 'additive' });
    state.surfaces.unshift(lightQuad);
    const shRes = api.setSurfaceShutters(lightQuad.id, {
      shutterL: 0.22,
      shutterR: 0.18,
      shutterT: 0.12,
      shutterB: 0.10,
      shutterAngL: 16,
      shutterAngR: -14,
      shutterSoft: 0.03
    });
    assert.strictEqual(shRes.ok, true, 'WebMapperAPI.setSurfaceShutters configured 4-blade framing shutters');
    assert(Math.abs(lightQuad.shutterL - 0.22) < 1e-6 && lightQuad.shutterAngL === 16);

    // Modulate Shutter Left via LFO & Performer Depth via LFO
    addModulatorForTarget('surface:' + lightQuad.id + ':shutterR', 'lfo', { waveform: 'sine', rateHz: 1.0, minVal: 0.10, maxVal: 0.40 });
    addModulatorForTarget('followspot:performerDepthM', 'lfo', { waveform: 'sine', rateHz: 0.5, minVal: 0.8, maxVal: 2.2 });
    updateModulatorsFrame(0.12);
    assert(lightQuad.shutterR >= 0.10 && lightQuad.shutterR <= 0.40, 'Modulation matrix drives 4-blade framing shutter');
    assert(state.followspot.performerDepthM >= 0.8 && state.followspot.performerDepthM <= 2.2, 'Modulation matrix drives 3D performer depth');
    clearModulatorsForTarget('surface:' + lightQuad.id + ':shutterR');
    clearModulatorsForTarget('followspot:performerDepthM');

    // Cue Snapshot & Recall round-trip preserves 4-blade shutters + 3D convergent followspot
    lightQuad.shutterL = 0.31;
    state.cues = [];
    storeNewCue();
    state.cues[0].fadeSec = 0;
    lightQuad.shutterL = 0.0;
    const snapSurf = state.cues[0].snapshot.surfaces.find(s => s.id === lightQuad.id);
    assert(snapSurf && Math.abs(snapSurf.shutterL - 0.31) < 1e-6, 'Cue snapshot preserves 4-blade framing shutters');
    api.triggerCue(state.cues[0].id);
    const recalledSurf = state.surfaces.find(s => s.id === lightQuad.id);
    assert(recalledSurf && Math.abs(recalledSurf.shutterL - 0.31) < 1e-6, 'Cue recall restores 4-blade framing shutters');

    // Full WebGL2 render pass smoke check with Stage Gobo Light + Convergent 3D Followspot + 4-Blade Shutters
    state.multiProjector.previewScreenIndex = 2;
    const convP2 = computeConvergentSpotForProjector(state.followspot, 2);
    renderSceneDescriptorToFbo(
      {
        surfaces: state.surfaces,
        groups: state.groups,
        masks: state.masks,
        followspot: convP2.followspot,
        masterFxChain: state.masterFxChain,
        allCalGrids: false
      },
      stageFboB,
      16 / 9
    );
    state.multiProjector.previewScreenIndex = 0;
  }
  console.log('✓ [11/12] Phase 7C Video-as-Light (3D-Convergent Multi-Projector Followspot, Stage Gobo Engine & 4-Blade Framing Shutters) verified');

  // ==========================================================================
  // 12. SHOW-SAFE UX STUDIO SYSTEMS (P1–P10 & A1–A8)
  // ==========================================================================
  {
    const api = window.WebMapperAPI;
    assert.strictEqual(typeof api.setCueRecordScope, 'function');
    assert.strictEqual(typeof api.setLayoutMode, 'function');
    assert.strictEqual(typeof api.searchCommands, 'function');
    assert.strictEqual(typeof api.getKeymap, 'function');

    // 1. Default Cue Record Scope = 'show' (protects physical room geometry!) + Shutter recall under geometry=false + Kinetic override
    state.cues = [];
    api.setCueRecordScope('show');
    const fixedQuad = createSurface('quad', { name: 'Fixed Arch Wall', shutterL: 0.25, animateGeomInShow: false });
    const kineticQuad = createSurface('quad', { name: 'Kinetic Fly Panel', points: [[0.1, 0.1], [0.4, 0.1], [0.4, 0.4], [0.1, 0.4]], animateGeomInShow: true });
    state.surfaces = [fixedQuad, kineticQuad];

    storeNewCue(); // Cue 1 stored in 'show' scope -> recallFilter.geometry === false!
    assert.strictEqual(state.cues[0].recallFilter.geometry, false, 'Show-only scope stores recallFilter.geometry = false by default');
    state.cues[0].fadeSec = 0;

    // Now simulate re-warping Fixed Arch Wall in a new venue, moving Kinetic Fly Panel, and opening ShutterL
    fixedQuad.points[0] = [0.22, 0.33];
    fixedQuad.shutterL = 0.0;
    kineticQuad.points[0] = [0.55, 0.55];

    api.triggerCue(state.cues[0].id);
    assert(Math.abs(fixedQuad.points[0][0] - 0.22) < 1e-6, 'Fixed venue surface warp preserved when recallFilter.geometry === false');
    assert(Math.abs(fixedQuad.shutterL - 0.25) < 1e-6, '4-Blade theatrical shutters DO recall under gradingFx even when geometry === false');
    assert(Math.abs(kineticQuad.points[0][0] - 0.10) < 1e-6, 'Kinetic surface (animateGeomInShow=true) animates geometry even under Show-only cue scope');

    // 2. Cue GO stops safely at END OF LIST without wrapping back to Cue 1!
    storeNewCue(); // Cue 2
    state.cues[1].fadeSec = 0;
    api.triggerCue(state.cues[0].id);
    assert.strictEqual(state.activeCueId, state.cues[0].id);
    stepCue(1);
    assert.strictEqual(state.activeCueId, state.cues[1].id, 'stepCue(1) advances to Cue 2');
    stepCue(1);
    assert.strictEqual(state.activeCueId, state.cues[1].id, 'stepCue(1) clamps safely at END OF LIST instead of wrapping to Cue 1');

    // 3. Asymmetric Blackout Safety: 0ms instant out, 600ms hold (or Shift bypass) to restore
    setBlackoutImmediate(false);
    beginBlackoutPress(false);
    assert.strictEqual(state.blackout, true, 'DBO engages immediately (0ms) on press');
    beginBlackoutPress(false);
    cancelOrFinishBlackoutPress(); // Released immediately (<600ms)
    assert.strictEqual(state.blackout, true, 'Accidental tap does NOT exit Blackout before 600ms hold');
    beginBlackoutPress(true); // Shift+B override
    assert.strictEqual(state.blackout, false, 'Shift override restores live output cleanly');

    // 4. Touring Load Show (Keep Venue): preserves physical venue warp, Stage Rig & DMX while loading new cues!
    fixedQuad.points[0] = [0.31, 0.29];
    state.masterKeystone.enabled = true;
    state.masterKeystone.points[0] = [0.07, 0.08];
    const savedShowJson = serializeShowData(false);

    // Mutate venue in a new theater
    fixedQuad.points[0] = [0.44, 0.41];
    state.masterKeystone.points[0] = [0.12, 0.14];
    state.cues = [];
    const keepRes = api.importShow(savedShowJson, { keepVenue: true });
    assert.strictEqual(keepRes, true);
    assert.strictEqual(state.cues.length, 2, 'Keep-Venue load imported incoming show cues');
    assert(Math.abs(state.surfaces[0].points[0][0] - 0.44) < 1e-6, 'Keep-Venue load preserved current venue surface warp');
    assert(Math.abs(state.masterKeystone.points[0][0] - 0.12) < 1e-6, 'Keep-Venue load preserved current venue Master Keystone');
    state.masterKeystone.enabled = false;

    // 5. 6-Pt PnP per-pin residual error array (pinErrorsPx), Non-Modal Rig Layout & Command Palette / Keymap
    const pnpSurf = createSurface('mesh3d', { name: 'PnP Test Cube', mesh3dPrimitive: 'cube' });
    pnpSurf.calibPins = autoSeed6CalibrationPins(pnpSurf, 16 / 9);
    pnpSurf.calibMode = 'calibrated';
    state.surfaces.unshift(pnpSurf);
    const pnpRes = api.solveSurfacePnP(pnpSurf.id);
    assert.strictEqual(pnpRes.ok, true);
    assert(Array.isArray(pnpRes.pinErrorsPx) && pnpRes.pinErrorsPx.length === 6, 'solveSurfacePnP returns per-pin pixel residual array pinErrorsPx');

    const rigMode = api.setLayoutMode('rig');
    assert.strictEqual(rigMode.layoutMode, 'rig', 'WebMapperAPI.setLayoutMode switches into non-modal Rig workspace');
    api.setLayoutMode('split');

    const dmxHits = api.searchCommands('dmx');
    const shutterHits = api.searchCommands('shutter');
    const soundHits = api.searchCommands('no sound');
    assert(dmxHits.some(h => h.id === 'dmx_pixel_mapper'), 'Command Palette finds DMX Pixel Mapper');
    assert(shutterHits.some(h => h.id === 'framing_shutters'), 'Command Palette finds 4-Blade Framing Shutters');
    assert(soundHits.some(h => h.id === 'audio_fft_sound'), 'Command Palette resolves operator symptom "no sound" -> Audio FFT & Video Unmute');

    const keymap = api.getKeymap();
    assert(Array.isArray(keymap) && keymap.length >= 18, 'Single Keymap Registry exposes >= 18 shortcuts');
    assert(!keymap.some(k => k.keys === 'Tab'), 'Keymap never assigns bare Tab');
  }
  console.log('✓ [12/13] Show-Safe UX Studio Systems (Glareshield, Venue/Show Cues, Keep-Venue Load, PnP Whiskers, Rig View & Command Palette) verified');

  // ============================================================================
  // 13. VISIONARY 6-PILLAR ARCHITECTURE (ROOMS, SIMULTANEOUS LIVE, SPOTS, PJLINK & .wmdevice.json DMX)
  // ============================================================================
  {
    const api = initWebMapperPublicAPI();
    ensureWorldRigSeeded();

    // Pillar 1: Boot into 2 · MAP (Decision 1A), auto-seeded 1 · WORLD, <16ms room switch & Hold-W reach-through
    assert.strictEqual(api.getRoom(), 'map', 'Studio boots into 2 · MAP by default (Decision 1A)');
    assert(state.multiProjector && state.multiProjector.screens.length >= 1, '1 · BUILD rig is auto-seeded ready');
    assert.strictEqual(api.setRoom('world').room, 'build', 'setRoom("world") alias normalizes to canonical "build"');
    assert.strictEqual(api.setRoom('build').room, 'build', 'setRoom("build") enters 1 · BUILD');
    assert.strictEqual(state.outputFeedTab, 'previz3d', '1 · BUILD defaults feed tab to 3D Previz');
    setOutputFeedTab('p1');
    assert.strictEqual(state.multiProjector.previewScreenIndex, 1, 'Feed tab P1 previews Projector 1 locally');
    assert.strictEqual(api.setRoom('live').room, 'live');
    assert.strictEqual(state.layoutMode, 'mix', '3 · LIVE displays ◎ Orbital Mix + Live Stage side-by-side');

    setLiveReachThrough(true);
    assert.strictEqual(state.liveReachThrough, true, 'Hold W arms surgical reach-through in 3 · LIVE');
    setLiveReachThrough(false);
    assert.strictEqual(state.liveReachThrough, false, 'Releasing W clears surgical reach-through');

    recordLiveCapturedTrim('surf:0:opacity', 0.72);
    assert.strictEqual(Object.keys(state.capturedTrims).length, 1, 'Live fader nudge records CAPTURED trim');
    releaseCapturedTrims();
    assert.strictEqual(Object.keys(state.capturedTrims).length, 0, 'Release clears CAPTURED trims');

    // Pillar 2: Simultaneous Live Engine (bus:orbital + Cues + Eos IFCB Spot Focus Ownership + Solo Stage Gamepad)
    const orbBus = getSourceById('bus:orbital');
    assert(orbBus && orbBus.id === 'src_mixbus', 'bus:orbital resolves directly to live Orbital Mix Bus');
    state.constellation.active = true;
    const prevCueId = state.cues[0]?.id;
    if (prevCueId) {
      triggerCueById(prevCueId, true);
      assert.strictEqual(state.constellation.active, true, 'Firing a Cue GO no longer kills active Constellation');
    }
    state.constellation.active = false;

    const spot0 = state.spots[0];
    assert.strictEqual(state.followspot, spot0, 'state.followspot live-aliases state.spots[0]');
    spot0.spotX = 0.81;
    spot0.targetX = 0.81;
    spot0._lastSeatTouchMs = Date.now(); // Active operator seat owns Focus!
    applySpotSnapshotWithIFCB(spot0, {
      mode: 'veil',
      spotX: 0.12,
      targetX: 0.12,
      radius: 0.36,
      colA: '#11ff99'
    }, 0);
    assert(Math.abs(spot0.targetX - 0.81) < 1e-6, 'ETC Eos IFCB preserves live-steered Spot Focus during Cue GO');
    assert(Math.abs(spot0.radius - 0.36) < 1e-6 && spot0.colA === '#11ff99', 'ETC Eos IFCB recalls Beam & Color attributes');

    // Gamepad Solo Stage profile (Decision 2A): L-Stick = Spot 1 (Blind Pre-Aim safe), R-Stick = Orbital Mix, Hold L1 + Press R1 = GO
    assert.strictEqual(state.gamepad.profile, 'solo_stage', 'Gamepad defaults to Solo Stage profile (Decision 2A)');
    // Frame A: Move sticks + D-Pad Up without L1+R1 -> Blind Pre-Aim moves targetX while keeping mode='off' & zero vertex nudge
    spot0.mode = 'off';
    const targetBeforePad = spot0.targetX;
    const stageBeforePad = spot0.targetStageXM;
    const surfPtBeforePad = [...state.surfaces[0].points[0]];
    mockGamepads = [{
      id: 'Mock DualSense',
      connected: true,
      axes: [0.7, 0.0, 0.5, 0.0],
      buttons: Array.from({ length: 16 }, (_, bi) => ({
        pressed: bi === 12, // D-Pad Up
        value: bi === 12 ? 1 : 0
      }))
    }];
    state.gamepad.prevButtons = {};
    pollGamepadFrame(1 / 60);
    assert.strictEqual(spot0.mode, 'off', 'Moving gamepad stick in Blind Pre-Aim NEVER auto-ignites a dark spot');
    assert(spot0.targetX > targetBeforePad || (spot0.converge3D && spot0.targetStageXM !== stageBeforePad), 'Gamepad L-Stick steers Spot 1 (screen targetX, or its 3D floor target when 3D-aimed)');
    assert.deepStrictEqual(state.surfaces[0].points[0], surfPtBeforePad, 'Gamepad D-Pad NEVER nudges geometry vertices in 3 · LIVE');

    // Frame B: Hold L1 (button 4) + Press R1 (button 5) -> Arm-and-Fire 0ms GO!
    if (state.cues.length >= 2) {
      state.activeCueId = state.cues[0].id;
      state.gamepad.prevButtons = { 0: [false, false, false, false, true, false] };
      mockGamepads = [{
        id: 'Mock DualSense',
        connected: true,
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 16 }, (_, bi) => ({
          pressed: bi === 4 || bi === 5,
          value: (bi === 4 || bi === 5) ? 1 : 0
        }))
      }];
      pollGamepadFrame(1 / 60);
      assert.strictEqual(state.activeCueId, state.cues[1].id, 'Hold L1 + Press R1 triggers 0ms Arm-and-Fire Cue GO');
    }
    mockGamepads = [null];

    // Pillar 3: GhostRig Launchpad Stamping & Safe Scrubby Math Parser
    stampWorldGhostPreset('wide_2x1');
    assert.strictEqual(state.multiProjector.screens.length, 2, 'GhostRig 2x1 Panorama stamps 2 unlocked editable projectors');
    assert.strictEqual(evaluateSafeStudioMath('3840 / 3'), 1280, 'Scrubby math parser evaluates 3840/3 === 1280');
    assert.strictEqual(evaluateSafeStudioMath('+15', 100), 115, 'Scrubby math parser evaluates relative +15');
    assert.strictEqual(evaluateSafeStudioMath('alert(1)'), null, 'Scrubby math parser rejects non-math expressions safely');

    // Pillar 4: Universal Multi-Spot Optical Bench (__pure_light__, Media Beam, Rotating Gobo)
    const addSpotRes = api.addSpot({ name: 'Key Gobo Spot', mode: 'additive', contentSrc: 'src_voronoi', goboSrc: 'src_grid', goboSpin: 1.5 });
    assert.strictEqual(addSpotRes.ok, true);
    assert(state.spots.length >= 3, 'Multi-Spot array supports adding independent optical spots');
    const neededIds = collectNeededSourceIds();
    assert(neededIds.has('src_voronoi') && neededIds.has('src_grid'), 'collectNeededSourceIds renders Spot contentSrc and goboSrc textures');

    // Pillar 6: .wmdevice.json DMX Patch, Priority Stack (Park > DBO > Seat > Cue > Modulator > Home), Hazer Hold & Power Safety
    state.dmxDevices = [];
    const dowserRes = api.addDmxDevice('dowser_1ch', { universe: 0, address: 1, linkProjector: 1 });
    const hazerRes = api.addDmxDevice('hazer_2ch', { universe: 0, address: 10 });
    const powerSpec = {
      wmdevice: '1.0',
      name: 'Relay + Dimmer Pack',
      channels: [
        { offset: 0, key: 'dim', label: 'Dimmer', kind: 'dimmer', home: 40, dbo: 'zero' },
        { offset: 1, key: 'relay', label: 'Mains Relay', kind: 'power', home: 255, dbo: 'hold' }
      ]
    };
    const pwrRes = api.importDmxDevice(powerSpec, { universe: 0, address: 20 });
    assert(dowserRes.ok && hazerRes.ok && pwrRes.ok, 'Built-in templates & custom .wmdevice.json imported cleanly');
    const exportedJson = api.exportDmxDevice(pwrRes.id);
    assert(exportedJson.includes('"wmdevice": "1.0"'), 'exportDmxDevice outputs clean .wmdevice.json');

    // Modulator targeting DMX dimmer works, while targeting power channel is strictly ignored!
    const dmxModDim = createModulator({
      kind: 'lfo',
      waveform: 'square',
      targetKey: 'dmx:' + pwrRes.id + ':dim',
      minVal: 180,
      maxVal: 180
    });
    const dmxModPower = createModulator({
      kind: 'lfo',
      waveform: 'square',
      targetKey: 'dmx:' + pwrRes.id + ':relay',
      minVal: 0,
      maxVal: 0
    });
    state.modulators.push(dmxModDim, dmxModPower);
    updateModulatorsFrame(1 / 60);

    // Set hazer live seat haze to 140
    api.setDmxChannel(hazerRes.id, 'haze', 140, 'seat');

    const uniMap = new Map();
    state.blackout = false;
    evaluateDmxDevicesIntoUniverses(uniMap);
    const u0Live = uniMap.get(0);
    assert.strictEqual(u0Live[0], 255, 'Dowser home open = 255 when live');
    assert.strictEqual(u0Live[9], 140, 'Hazer haze outputs seat value 140');
    assert.strictEqual(u0Live[19], 180, 'Modulator drives non-power DMX dimmer channel to 180');
    assert.strictEqual(u0Live[20], 255, 'Power channel ignores modulator and stays safely at 255');

    // Engage DBO: Dowser drops to 0, Dimmer drops to 0, Hazer HOLDS 140!
    api.requestBlackout(true);
    evaluateDmxDevicesIntoUniverses(uniMap);
    assert.strictEqual(u0Live[0], 0, 'Dowser closes to 0 on DBO');
    assert.strictEqual(u0Live[19], 0, 'Dimmer zeros on DBO');
    assert.strictEqual(u0Live[9], 140, 'Hazer dbo="hold" preserves 140 haze output during DBO');

    // Park overrides DBO!
    api.setDmxChannel(dowserRes.id, 'shutter', 200, 'park');
    evaluateDmxDevicesIntoUniverses(uniMap);
    assert.strictEqual(u0Live[0], 200, 'Park priority overrides DBO');
    api.setDmxChannel(dowserRes.id, 'shutter', null, 'park');
    api.requestBlackout(false, { force: true });

    // Collision check across overlapping addresses
    const colDev = api.addDmxDevice('dowser_1ch', { universe: 0, address: 10 });
    const collisions = computeDmxPatchCollisions();
    assert(collisions.length >= 1, '512-channel collision detector catches overlapping DMX patch at Ch 10');
    removeDmxDevice(colDev.id);

    // Pillar 5: Ephemeral TCP Mock PJLink Class 1 Server (MD5 Digest Auth, AVMT 31/30, POWR 0 Guard) + --lan /pad Token Gate
    const pjCommandsLog = [];
    const pjNonce = '498e4a67';
    const pjPass = 'panasonic';
    const mockPjServer = net.createServer((sock) => {
      sock.write('PJLINK 1 ' + pjNonce + '\\r');
      sock.on('data', (chunk) => {
        const line = chunk.toString('utf8').trim();
        const expectedHash = crypto.createHash('md5').update(pjNonce + pjPass).digest('hex');
        if (!line.startsWith(expectedHash + '%1')) {
          sock.write('PJLINK ERRA\\r');
          sock.end();
          return;
        }
        const body = line.slice(expectedHash.length); // e.g. %1AVMT 31
        pjCommandsLog.push(body);
        const cmd4 = body.slice(2, 6);
        if (body.includes('?')) {
          sock.write('%1' + cmd4 + '=1250 0\\r');
        } else {
          sock.write('%1' + cmd4 + '=OK\\r');
        }
        sock.end();
      });
    });
    await new Promise(res => mockPjServer.listen(0, '127.0.0.1', res));
    const pjPort = mockPjServer.address().port;

    const okMute = await bridge.sendPjLinkCommand({ host: '127.0.0.1', port: pjPort, password: pjPass, command: '%1AVMT 31' });
    assert.strictEqual(okMute.ok, true, 'PJLink MD5 authenticated AVMT 31 succeeded');
    assert.strictEqual(pjCommandsLog[0], '%1AVMT 31');

    const badPass = await bridge.sendPjLinkCommand({ host: '127.0.0.1', port: pjPort, password: 'wrong', command: '%1AVMT 30' });
    assert.strictEqual(badPass.ok, false, 'PJLink rejects wrong MD5 password with ERRA');

    // POWR 0 guard outside 1 · WORLD
    api.setRoom('live');
    state.multiProjector.screens[0].pjlink = { enabled: true, ip: '127.0.0.1', port: pjPort, password: pjPass, linkDbo: true, measuredShutterMs: 200 };
    const blockedPowr = await sendStudioPjLink(1, 'POWR 0', { confirmedWorldPowerOff: false });
    assert.strictEqual(blockedPowr.ok, false, 'POWR 0 lamp power-off is hard-blocked in 3 · LIVE');

    // Two-Stage DBO Pre-Open & Early-Release Re-Close check
    state.blackout = true;
    state.dboState.active = true;
    state.dboState.preOpened = false;
    schedulePreOpenDboShutters(200); // measuredShutterMs=200 => clamps to 40ms pre-open while WebGL stays black!
    await new Promise(r => setTimeout(r, 65));
    assert.strictEqual(state.dboState.preOpened, true, 'Two-stage DBO pre-opens mechanical shutters before WebGL fade');
    assert.strictEqual(state.blackout, true, 'WebGL stays 0.0 black while physical shutter blades travel open');
    abortPreOpenDboShutters();
    assert.strictEqual(state.dboState.preOpened, false, 'Releasing Hold-B early immediately re-closes pre-opened shutters');
    state.blackout = false;
    state.dboState.active = false;

    mockPjServer.close();

    // Bridge --lan /pad token gate check
    const lanBridge = bridge.createBridgeServer({ wsPort: 0, lan: true, token: 'test_secret_pad_token_1234' });
    await new Promise(res => lanBridge.httpServer.listen(0, '127.0.0.1', res));
    const bPort = lanBridge.httpServer.address().port;
    const fetchStatus = (urlPath) => new Promise((resolve, reject) => {
      http.get('http://127.0.0.1:' + bPort + urlPath, (res) => {
        res.resume();
        resolve(res.statusCode);
      }).on('error', reject);
    });
    const codeNoTok = await fetchStatus('/pad');
    const codeGoodTok = await fetchStatus('/pad?token=test_secret_pad_token_1234');
    assert.strictEqual(codeNoTok, 403, '/pad without valid token returns 403 Forbidden');
    assert.strictEqual(codeGoodTok, 200, '/pad with valid pairing token returns 200 Touch Remote HTML');
    lanBridge.close();

    api.setRoom('map');
  }
  console.log('✓ [13/14] Visionary 6-Pillar Studio (3 Rooms, Simultaneous Live + IFCB, GhostRig + Math Scrub, Multi-Spot Bench, PJLink TCP Auth & .wmdevice.json DMX) verified');

  // ============================================================================
  // 14. v2.1 PLAYTEST REFINEMENTS (BUILD WORLD SCREENS/BEAMS/FLOORPLAN, DISABLE/0-SPOT, TRACKPAD CYCLER, PRIORITY ACTION CUES & CONTEXTUAL DELETE)
  // ============================================================================
  {
    const api = initWebMapperPublicAPI();
    ensureWorldRigSeeded();

    // 1. 1 · BUILD Sub-Views (Split / 2D Plan / 3D World / Stage)
    setStudioRoom('build');
    assert.strictEqual(setBuildViewMode('plan2d'), 'plan2d');
    assert.strictEqual(setBuildViewMode('world3d'), 'world3d');
    assert.strictEqual(setBuildViewMode('warp'), 'warp');
    assert.strictEqual(setBuildViewMode('split'), 'split');

    // 2. Physical World Screens (Add, Orient, Raycast, Delete down to 0)
    while (state.worldScreens.length > 0) removeWorldScreen(0);
    assert.strictEqual(state.worldScreens.length, 0, 'All physical screens can be deleted down to 0');
    const wingScr = addWorldScreen({
      name: 'Angled Wing Screen',
      widthM: 4.0,
      heightM: 3.0,
      posM: [2.5, 1.5, -2.0],
      yawDeg: -35,
      pitchDeg: 0
    });
    assert.strictEqual(state.worldScreens.length, 1, 'Added angled physical screen');

    // Orient projector via Yaw/Pitch toward the angled wing screen and verify frustum raycast follows orientation!
    if (state.multiProjector.screens.length === 0) {
      state.multiProjector.screens.push(createProjectorScreenSlice(1, { name: 'P1' }));
    }
    const proj0 = state.multiProjector.screens[0];
    proj0.posM = [0.0, 1.5, 3.0];
    // Vector from [0, 1.5, 3.0] to [2.5, 1.5, -2.0] is [+2.5, 0, -5.0] => yaw = atan2(2.5, 5.0) = +26.565 deg
    proj0.yawDeg = (Math.atan2(2.5, 5.0) * 180) / Math.PI;
    proj0.pitchDeg = 0;
    syncProjectorAimFromAngles(proj0);
    const opticsWing = computeProjectorOptics3D(proj0, state.multiProjector, []);
    assert.strictEqual(opticsWing.hitKind, 'world_screen', 'Oriented projector beam raycast hits angled physical screen');
    assert.strictEqual(opticsWing.hitId, wingScr.id, 'Oriented projector beam hits exact wing screen ID');

    // Pitch projector down toward stage floor (Y = 0) when 0 screens exist
    setActiveSelection('world_screen', wingScr.id, wingScr.name);
    assert.strictEqual(deleteActiveSelection(), true, 'Contextual Delete removes selected physical screen');
    assert.strictEqual(state.worldScreens.length, 0, '0 physical screens remain after contextual delete');
    proj0.yawDeg = 0;
    proj0.pitchDeg = -40;
    syncProjectorAimFromAngles(proj0);
    // Theatre venue (default): a downward beam lands on the raised stage deck, not the house floor
    const deckHitOptics = computeProjectorOptics3D(proj0, state.multiProjector, []);
    if (deckHitOptics.hitKind === 'deck') {
      const deckRay = raycastWorldForProjector(proj0.posM, deckHitOptics.fAxis, [], 6.0);
      const dk = getVenueLayout().boxes.find(b => b.id === 'deck');
      assert(dk && deckRay.point[1] <= dk.max[1] + 1e-3 && deckRay.point[2] >= dk.min[2] - 1e-3 && deckRay.point[2] <= dk.max[2] + 1e-3, 'Theatre beam lands on the stage deck (top or downstage lip)');
    }
    // Flat-floor venue: the same beam reaches Y=0
    syncWorldStageDimensions(null, null, null, 'gallery');
    const opticsFloor = computeProjectorOptics3D(proj0, state.multiProjector, []);
    assert.strictEqual(opticsFloor.hitKind, 'floor', 'Downward-pitched projector beam intersects Y=0 stage floor');
    const centerRayFloor = raycastWorldForProjector(proj0.posM, opticsFloor.fAxis, [], 6.0);
    assert(Math.abs(centerRayFloor.point[1]) < 1e-4, 'Floor intersection lies at Y=0');

    // Projectors can also be deleted down to 0 via contextual delete
    while (state.multiProjector.screens.length > 0) {
      const s = state.multiProjector.screens[0];
      setActiveSelection('projector', String(s.index), s.name);
      assert.strictEqual(deleteActiveSelection(), true, 'Contextual Delete removes selected projector');
    }
    assert.strictEqual(state.multiProjector.screens.length, 0, 'Projectors can be deleted down to 0 in 1 · BUILD');
    // Restore 1 screen + 1 projector for subsequent checks
    addWorldScreen({ id: 'wscr_1', name: 'Main Stage Screen', widthM: 6.0, heightM: 3.38, posM: [0, 1.69, -2.0], yawDeg: 0 });
    state.multiProjector.screens.push(createProjectorScreenSlice(1, { name: 'Screen 1' }));

    // 3. Floorplan Import, 2-Point Scale Calibration & Contextual Delete
    const fp = importFloorplanFromDataUrl('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48L3N2Zz4=', 'StagePlot.svg');
    fp.widthM = 10.0;
    const scaledW = applyFloorplanTwoPointScale([0, 0], [2.0, 0], 6.0); // 2m measured = 6m real => 3x width = 30m
    assert(Math.abs(scaledW - 30.0) < 1e-6, 'Floorplan 2-point scale ruler computes exact real-world meters');
    setActiveSelection('floorplan', 'floorplan', 'StagePlot.svg');
    assert.strictEqual(deleteActiveSelection(), true, 'Contextual Delete clears floorplan underlay');
    assert.strictEqual(state.floorplan.dataUrl, '', 'Floorplan dataUrl cleared');

    // 4. Disableable & Delete-to-0 Spotlights + No-Controller Trackpad Cycler
    while (state.spots.length > 0) removeSpotById(state.spots[0].id);
    assert.strictEqual(state.spots.length, 0, 'All spotlights deleted down to 0');
    assert.strictEqual(getActiveLiveSpot(), null, 'getActiveLiveSpot() returns null when 0 spots exist');
    const safeDetached = getActiveSpot();
    assert.strictEqual(state.spots.length, 0, 'getActiveSpot() NEVER resurrects deleted spots when 0 remain');
    assert(safeDetached && safeDetached.id === '_detached' && safeDetached.enabled === false, 'getActiveSpot() returns safe inert detached fallback object');
    setStudioRoom('live');
    assert.strictEqual(state.spots.length, 0, 'Entering 3 · LIVE NEVER resurrects deleted spots');

    // Serialize + re-import show with 0 spots -> stays 0 spots!
    const zeroSpotJson = JSON.stringify(serializeShowData());
    importShowJson(zeroSpotJson, { keepVenue: false });
    assert.strictEqual(state.spots.length, 0, 'Show JSON roundtrip preserves 0-spot show without respawning Spot 1');

    // Add 2 spots, disable Spot 1, verify Trackpad Cycler skips disabled Spot 1 and cycles None -> Spot 2 -> None
    const spA = addSpotInstance({ id: 'spot_a', name: 'Spot A', mode: 'beam', enabled: true });
    const spB = addSpotInstance({ id: 'spot_b', name: 'Spot B', mode: 'beam', enabled: true });
    assert.strictEqual(state.spots.length, 2);
    toggleSpotEnabled(spA.id, false);
    assert.strictEqual(spA.enabled, false, 'Spot A disabled cleanly');
    setTrackpadSpotTarget(null, { silent: true });
    assert.strictEqual(cycleTrackpadSpotTarget(1, { silent: true }), spB.id, 'Trackpad cycler skips disabled Spot A and selects Spot B');
    assert.strictEqual(cycleTrackpadSpotTarget(1, { silent: true }), null, 'Trackpad cycler wraps back to None');
    toggleSpotEnabled(spA.id, true);

    // Contextual Delete on Spot B
    setActiveSelection('spot', spB.id, spB.name);
    assert.strictEqual(deleteActiveSelection(), true, 'Contextual Delete removes selected Spot B');
    assert.strictEqual(state.spots.length, 1);

    // 5. Out-of-Sequence Action Cues (Priority Override vs Sequenced GO) + Live Cue Transport (Hold / Rate / T-Bar)
    state.cues = [];
    state.activeOverrideCueIds = [];
    state.surfaces[0].opacity = 0.25;
    storeNewCue({ name: 'Seq Cue 1', fadeSec: 0 });
    const seq1Id = state.cues[state.cues.length - 1].id;

    // Store an Out-of-Sequence Deck Cue RIGHT IN THE MIDDLE of the cue list to prove stepCue(1) skips it!
    state.surfaces[0].opacity = 1.0;
    storeNewCue({ name: 'Strobe Hit (Priority)', cueRole: 'deck', priorityMode: 'override', fadeSec: 0, releaseSec: 0 });
    const deckId = state.cues[state.cues.length - 1].id;

    state.surfaces[0].opacity = 0.55;
    storeNewCue({ name: 'Seq Cue 2', fadeSec: 2.0 });
    const seq2Id = state.cues[state.cues.length - 1].id;

    // Trigger Seq Cue 1, then verify stepCue(1) skips the middle deck cue to hit Seq Cue 2, then hits END OF LIST!
    triggerCueById(seq1Id, true);
    assert(Math.abs(state.surfaces[0].opacity - 0.25) < 1e-5, 'Seq Cue 1 sets surface opacity to 0.25');

    state.cuePlayback.paused = false;
    state.cuePlayback.tbarHeld = false;
    state.cuePlayback.rate = 1.0;
    assert.strictEqual(stepCue(1), true, 'stepCue(1) advances across deck cue directly to Seq Cue 2');
    assert.strictEqual(state.activeCueId, seq2Id, 'stepCue(1) lands on Seq Cue 2 (skipping out-of-sequence deck cue)');
    assert.strictEqual(stepCue(1), false, 'stepCue(1) stops safely at END OF LIST without triggering deck cues');

    // Test Live Cue Transport Hold + T-Bar + 2x Rate on Dual-FBO Crossfade (Seq Cue 1 -> Seq Cue 2, duration=2.0s)
    triggerCueById(seq1Id, true);
    triggerCueById(seq2Id, false);
    assert.strictEqual(state.crossfade.active, true, 'Dual-FBO crossfade active on 2.0s cue');
    state.cuePlayback.paused = true;
    updateCrossfade(0.5);
    assert.strictEqual(state.crossfade.elapsed, 0, 'Paused cue transport holds Dual-FBO crossfade frozen at 0%');
    setLiveCueTBar(0.5);
    assert(Math.abs(state.crossfade.mix - 0.5) < 1e-5 && state.cuePlayback.tbarHeld === true, 'Live T-Bar scrubs Dual-FBO crossfade mix to 50%');
    state.cuePlayback.paused = false;
    state.cuePlayback.tbarHeld = false;
    state.cuePlayback.rate = 2.0; // 2x rate: remaining 1.0s finishes in 0.5s dt!
    updateCrossfade(0.5);
    assert.strictEqual(state.crossfade.active, false, '2x fade rate completes remaining 1.0s crossfade in 0.5s');
    state.cuePlayback.rate = 1.0;
    triggerCueById(seq1Id, true);
    assert(Math.abs(state.surfaces[0].opacity - 0.25) < 1e-5);

    // Fire Priority Override Action Cue -> opacity jumps to 1.0 AND stays 1.0 even when sequenced Seq Cue 2 fires underneath!
    triggerCueById(deckId, true);
    assert(state.activeOverrideCueIds.includes(deckId), 'Priority Override deck cue latches active');
    assert(Math.abs(state.surfaces[0].opacity - 1.0) < 1e-5, 'Priority Override deck cue drives opacity to 1.0');
    triggerCueById(seq2Id, true);
    assert(Math.abs(state.surfaces[0].opacity - 1.0) < 1e-5, 'Active Priority Override cue holds 1.0 on top of sequenced GO');
    // Toggle Priority Override deck cue off -> releases cleanly back to underlying Seq Cue 2 (0.55)!
    triggerCueById(deckId, true);
    assert(!state.activeOverrideCueIds.includes(deckId), 'Second trigger toggles Priority Override deck cue off');
    assert(Math.abs(state.surfaces[0].opacity - 0.55) < 1e-5, 'Releasing Priority Override restores underlying sequenced cue state');

    // 6. Contextual Delete on Cue & Mix Orb
    setActiveSelection('cue', deckId, 'Strobe Hit');
    assert.strictEqual(deleteActiveSelection(), true, 'Contextual Delete removes selected cue');
    assert(!state.cues.some(c => c.id === deckId), 'Deleted cue removed from state.cues');

    const mixSrc = getMixbusSource();
    const orbCountBefore = mixSrc.orbs.length;
    if (orbCountBefore > 0) {
      const targetOrb = mixSrc.orbs[orbCountBefore - 1];
      setActiveSelection('mix_orb', targetOrb.id, 'Orb');
      assert.strictEqual(deleteActiveSelection(), true, 'Contextual Delete removes selected Mix Orb');
      assert.strictEqual(mixSrc.orbs.length, orbCountBefore - 1, 'Mix Orb removed from mixSrc.orbs');
    }

    setStudioRoom('map');
  }
  console.log('✓ [14/14] v2.1 Playtest Refinements (1·BUILD Screens/Beams/Floorplan, Disable/0-Spot + Trackpad Cycler, Priority Action Cues & Contextual Delete) verified');

  // ==========================================================================
  // 15. Pass 1 · BUILD ergonomics: auto-aimed projectors, beam-miss diagnostics,
  //     fit-to-content plan view, anchored floorplan calibration, DMX undo
  // ==========================================================================
  {
    setStudioRoom('build');
    const mp = ensureMultiProjectorState();
    const sp = ensureStagePlanState(mp);
    state.worldScreens = [createWorldScreen(1, { id: 'wscr_t', name: 'T Screen', widthM: 6, heightM: 3.375, posM: [0, 2.3375, -2.6] })];
    state.selectedWorldScreenId = 'wscr_t';

    // New projector slices (no explicit pose) land on the crop region of the target screen
    // (crops only apply when multi-projector output is on; otherwise each shows the full stage).
    const fullFrame = createProjectorScreenSlice(4, { cropX: 0, cropW: 0.5 });
    assert(!mp.enabled && Math.abs(fullFrame.aimM[0]) < 1e-3, 'Multi-projector off: a projector shows the whole stage, so it aims at the screen centre');
    mp.enabled = true;
    const left = createProjectorScreenSlice(1, { cropX: 0, cropW: 0.5 });
    const right = createProjectorScreenSlice(2, { cropX: 0.5, cropW: 0.5 });
    assert(Math.abs(left.aimM[0] - (-1.5)) < 1e-3, 'Left-half slice aims at the left half centre (x=-1.5m)');
    assert(Math.abs(right.aimM[0] - 1.5) < 1e-3, 'Right-half slice aims at the right half centre (x=+1.5m)');
    assert(Math.abs(left.aimM[2] - (-2.6)) < 1e-3 && left.posM[2] > 0, 'Projector sits in front of the screen, aimed onto its plane');
    assert(Math.abs(left.yawDeg) < 1e-6 && Math.abs(left.pitchDeg) < 1e-6, 'Square-on placement has zero yaw/pitch');

    // Auto-aim targets an angled screen through its basis.
    state.worldScreens.push(createWorldScreen(2, { id: 'wscr_y', name: 'Angled', widthM: 4, heightM: 2.25, posM: [2, 1.8, -1], yawDeg: 30 }));
    const pr = createProjectorScreenSlice(3, {});
    autoAimProjectorAtWorldScreen(pr, state.worldScreens[1]);
    assert(Math.hypot(pr.aimM[0] - 2, pr.aimM[1] - 1.8, pr.aimM[2] + 1) < 1e-3, 'Full-frame projector aims at the angled screen centre');
    assert(Math.abs(pr.yawDeg + 30) < 0.5, 'Projector yaw mirrors the angled screen normal (-30 deg)');

    mp.screens = [left, right];
    let field = solveStagePlanOpticalField(mp, true);
    assert.strictEqual(field.opticsByIndex.get(1).missesAllTargets, false, 'Auto-aimed beam hits a screen');
    left.aimM = [-12, 2.3, -2.6];
    syncProjectorAnglesFromAim(left);
    field = solveStagePlanOpticalField(mp, true);
    assert.strictEqual(field.opticsByIndex.get(1).missesAllTargets, true, 'Beam aimed off into the wings is flagged as missing every screen');

    // Fit view frames every projector body (none off-canvas).
    left.posM = [-9, 2.3, 3];
    const fit = computeStagePlanFitView(sp, 800, 600);
    const base = Math.min((800 - 52) / sp.venue.roomWidthM, (600 - 52) / sp.venue.roomDepthM);
    const scale = base * fit.zoom;
    const px = 400 - fit.panX * scale + left.posM[0] * scale;
    assert(px > 0 && px < 800, 'Fit view keeps a far-off projector inside the canvas');

    // Two-point floorplan calibration scales about Point A (it stays put).
    const fp = ensureFloorplanState();
    fp.dataUrl = 'data:image/png;base64,AA==';
    fp.widthM = 10; fp.offsetX = 1; fp.offsetZ = 0.5; fp.rotDeg = 0;
    const ptA = [-2, -1], ptB = [2, -1];
    const relBefore = [(ptA[0] - fp.offsetX) / fp.widthM, (ptA[1] - fp.offsetZ) / fp.widthM];
    applyFloorplanTwoPointScale(ptA, ptB, 8);
    assert(Math.abs(fp.widthM - 20) < 1e-6, '4m measured as 8m doubles the plan width');
    const aNow = [fp.offsetX + relBefore[0] * fp.widthM, fp.offsetZ + relBefore[1] * fp.widthM];
    assert(Math.hypot(aNow[0] - ptA[0], aNow[1] - ptA[1]) < 1e-2, 'Point A stays anchored after calibration');
    fp.dataUrl = ''; fp._img = null;

    // DMX utility device delete is undoable.
    state.dmxDevices = [];
    createDmxDeviceFromTemplate('dowser_1ch', {});
    const devId = state.dmxDevices[0].id;
    setActiveSelection('dmx_device', devId, 'Dowser');
    deleteActiveSelection();
    assert.strictEqual(state.dmxDevices.length, 0);
    performUndo();
    assert.strictEqual(state.dmxDevices.length, 1, 'Undo restores a deleted DMX device');

    setStudioRoom('map');
  }
  console.log('✓ [15/15] Pass 1 · BUILD (Auto-Aim Projectors, Beam-Miss Diagnostics, Fit View, Anchored Floorplan Calibration & DMX Undo) verified');

  // ==========================================================================
  // 16. Pass 2 · MAP: venue calibration tracking into cues, curved-look re-projection,
  //     protected geometry (arrow nudges need Hold W in 2 · MAP)
  // ==========================================================================
  {
    setStudioRoom('map');
    const q = [[0.3, 0.14], [0.7, 0.14], [0.64, 0.86], [0.36, 0.86]];
    const remapped = remapPointsBetweenQuads([[0.3, 0.14], [0.7, 0.86]], q, [[0.25, 0.1], [0.7, 0.14], [0.64, 0.86], [0.36, 0.86]]);
    assert(Math.hypot(remapped[0][0] - 0.25, remapped[0][1] - 0.1) < 1e-6, 'Quad remap carries the moved corner exactly');

    state.surfaces = [createSurface('quad')];
    const surf = state.surfaces[0];
    surf.points = q.map(p => [p[0], p[1]]);
    bumpSurfaceGeom(surf);
    state.cues = [];
    state.cueRecordScope = 'show_venue';
    storeNewCue();
    const flatCue = state.cues[0];
    flatCue.recallFilter = { ...flatCue.recallFilter, geometry: true };
    // A look cue whose quad carries its own curved mesh on the same corners
    storeNewCue();
    const curvedCue = state.cues[1];
    curvedCue.recallFilter = { ...curvedCue.recallFilter, geometry: true };
    const cs = curvedCue.snapshot.surfaces.find(x => x.id === surf.id);
    curvedCue.snapshot = { ...curvedCue.snapshot, surfaces: curvedCue.snapshot.surfaces.map(x => x.id === surf.id ? { ...cs, quadWarp: 'mesh', meshPts: [[0.3, 0.14], [0.5, 0.3]] } : x) };
    state.cueRecordScope = 'show';
    rebaseVenueGeometryTracking();

    // Calibrate in BUILD: move corner 0
    setStudioRoom('build');
    pushUndoCheckpoint('Calibrate');
    surf.points[0] = [0.25, 0.1];
    bumpSurfaceGeom(surf);
    triggerCueById(flatCue.id, { fadeOverride: 0 });
    const live = state.surfaces.find(x => x.id === surf.id);
    assert(Math.hypot(live.points[0][0] - 0.25, live.points[0][1] - 0.1) < 1e-6, 'Recalling a geometry cue keeps the new BUILD calibration');
    const curvedNow = curvedCue.snapshot.surfaces.find(x => x.id === surf.id);
    assert(Math.hypot(curvedNow.points[0][0] - 0.25, curvedNow.points[0][1] - 0.1) < 1e-6, 'Other cues track the calibrated corner');
    assert(Math.hypot(curvedNow.meshPts[0][0] - 0.25, curvedNow.meshPts[0][1] - 0.1) < 1e-6, 'Curved-mesh look is re-projected onto the calibrated quad');

    // Protected geometry: arrow nudge in 2 · MAP without Hold W does nothing
    // (overlay module is browser-only; verified there when present)
    setStudioRoom('map');
    if (typeof nudgeSelectedTargetByDelta === 'function') {
      selectSurface(live.id);
      state.selectedVertex = null;
      const before = JSON.stringify(live.points);
      nudgeSelectedTargetByDelta(0.01, 0, false);
      assert.strictEqual(JSON.stringify(live.points), before, 'Arrow nudge cannot move geometry in 2 · MAP without Hold W');
    }
  }
  console.log('✓ [16/16] Pass 2 · MAP (Venue Calibration Tracking into Cues, Curved-Look Re-Projection & Protected Geometry) verified');
  // ==========================================================================
  // 17. Venue model, people, DMX lights in the world, effective crops and
  //     3D-converged spot routing with per-projector calibration trims (05h).
  // ==========================================================================
  {
    setStudioRoom('build');
    const mp = ensureMultiProjectorState();
    ensureStagePlanState(mp);
    state.worldScreens = [createWorldScreen(1, { id: 'wscr_v', name: 'V Screen', widthM: 6, heightM: 3.375, posM: [0, 2.3375, -2.6] })];
    state.selectedWorldScreenId = 'wscr_v';

    // Venue layouts: theatre has a deck + arch, outdoor has no walls, gallery is flat.
    syncWorldStageDimensions(6, 3.4, 4, 'proscenium');
    let lay = getVenueLayout();
    assert(lay.deckH > 0.3 && lay.boxes.some(b => b.kind === 'deck') && lay.boxes.some(b => b.kind === 'arch') && lay.room.walls, 'Theatre venue: raised deck, proscenium arch and room walls');
    assert(Math.abs(getVenueFloorHeightAt(0, -1.5) - lay.deckH) < 1e-6 && getVenueFloorHeightAt(0, 4) === 0, 'Standing height is the deck on stage and the floor in the house');
    syncWorldStageDimensions(null, null, null, 'outdoor');
    lay = getVenueLayout();
    assert(!lay.room.walls && lay.outdoor, 'Outdoor park venue has no walls');
    const skyRay = raycastWorldForProjector([0, 3, 4], [0, 0.3, -1], [], 12);
    assert.strictEqual(skyRay.hitKind, 'air', 'Outdoors a beam aimed above the stage flies into open air');
    syncWorldStageDimensions(null, null, null, 'gallery', { deckHeightM: 0 });
    lay = getVenueLayout();
    const wallRay = raycastWorldForProjector([0, 2, 0], [1, 0, 0], [], 6);
    assert.strictEqual(wallRay.hitKind, 'wall', 'Indoors a sideways beam stops on the room wall instead of mid-air');
    syncWorldStageDimensions(null, null, null, 'proscenium', { deckHeightM: 0.6 });

    // Beam range diagnostics: focus & brightness range exposed on optics.
    const scrA = createProjectorScreenSlice(1, {});
    mp.screens = [scrA];
    const opt = computeProjectorOptics3D(scrA, mp, []);
    assert(opt.luxRangeM > 5 && opt.focusFarM > opt.focusNearM, 'Optics report usable brightness range and focus window');

    // People: seeded performer stands on the deck; props occlude beams & move on the floor.
    state.worldProps = undefined;
    state._worldPropsSeeded = false;
    const props = ensureWorldPropsState();
    assert.strictEqual(props.length, 1, 'One default human figure is seeded as a scale reference');
    assert(Math.abs(props[0].posM[1] - getVenueFloorHeightAt(props[0].posM[0], props[0].posM[2])) < 1e-3, 'Default performer stands on the deck');
    const occ = collectVenue3DOccluders(mp);
    assert(occ.some(o => o.isProp && o.tris.length > 60), 'Human figure is a mesh occluder for beam shadows');
    const p2 = addWorldProp('human', { posM: [1, 0, 3] });
    moveWorldPropTo(p2, 1, 3.5);
    assert(Math.abs(p2.posM[1]) < 1e-6 && p2.posM[2] === 3.5, 'Moving a figure into the house drops it to the floor');
    assert.strictEqual(removeWorldProp(p2.id), true, 'Figure can be deleted');

    // DMX lights get a world pose and a live beam from their channels.
    state.dmxDevices = [];
    const par = createDmxDeviceFromTemplate('par_rgbw_5ch');
    assert(Array.isArray(par.posM) && Array.isArray(par.aimM) && par.templateId === 'par_rgbw_5ch', 'New PAR is placed on the rig with a world pose');
    assert.strictEqual(getDmxLightOutput(par).intensity, 0, 'PAR is dark at home values');
    setDmxDeviceChannelValue(par.id, 'dimmer', 255, 'seat');
    const parOut = getDmxLightOutput(par);
    assert(parOut.intensity === 1 && parOut.color[0] > parOut.color[2], 'PAR output follows dimmer + colour channels');
    const mh = createDmxDeviceFromTemplate('moving_head_8ch');
    const base = getDmxLightOutput(mh).dir;
    setDmxDeviceChannelValue(mh.id, 'pan', 200, 'seat');
    const panned = getDmxLightOutput(mh).dir;
    assert(Math.hypot(base[0] - panned[0], base[2] - panned[2]) > 0.05, 'Moving-head pan channel swings the beam');
    const reloaded = createDmxDeviceFromSpec(JSON.parse(JSON.stringify(par)), JSON.parse(JSON.stringify(par)));
    assert(reloaded.posM.every((n, k) => Math.abs(n - par.posM[k]) < 1e-9), 'DMX world pose survives save/load');

    // Effective crops: multi-projector off → full stage; on → slice.
    const half = createProjectorScreenSlice(2, { cropX: 0.5, cropW: 0.5 });
    mp.enabled = false;
    assert.deepStrictEqual(getEffectiveProjectorCrop(half), { x: 0, y: 0, w: 1, h: 1 }, 'Multi-projector off: every projector emits the full stage');
    mp.enabled = true;
    assert(Math.abs(getEffectiveProjectorCrop(half).x - 0.5) < 1e-9, 'Multi-projector on: projector emits its slice');

    // Spot routing + 3D convergence through each projector's own lens.
    const pL = createProjectorScreenSlice(1, { posM: [-2.5, 2.4, 5], aimM: [0, 2.3, -2.6] });
    const pR = createProjectorScreenSlice(2, { posM: [2.5, 2.4, 5], aimM: [0, 2.3, -2.6] });
    mp.enabled = false;
    mp.screens = [pL, pR];
    solveStagePlanOpticalField(mp, true);
    const spot = createSpotObject(0, { mode: 'beam', converge3D: true, followPropId: props[0].id, radius: 0.1 });
    const cL = computeConvergentSpotForProjector(spot, 1, mp);
    const cR = computeConvergentSpotForProjector(spot, 2, mp);
    assert(cL.followspot.spotX > cR.followspot.spotX + 0.02, 'Projectors on opposite sides draw the spot at different raster points (converging on the performer)');
    const T = getSpotWorldTargetM(spot);
    for (const [scr, c] of [[pL, cL], [pR, cR]]) {
      const o = computeProjectorOptics3D(scr, mp, []);
      const pu = c.followspot.spotX, pv = c.followspot.spotY;
      const dir = [0, 1, 2].map(k => o.fAxis[k] + (pu - o.cx0) * o.wUnit * o.rAxis[k] + (pv - o.cy0) * o.hUnit * o.uAxis[k]);
      const d = [0, 1, 2].map(k => T[k] - o.eye[k]);
      const t = (d[0] * dir[0] + d[1] * dir[1] + d[2] * dir[2]) / (dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]);
      const miss = Math.hypot(...[0, 1, 2].map(k => o.eye[k] + dir[k] * t - T[k]));
      assert(miss < 0.01, 'P' + scr.index + ' beam through its spot pixel passes within 1 cm of the performer');
    }
    spot.projectors = [2];
    assert.strictEqual(computeConvergentSpotForProjector(spot, 1, mp).followspot.mode, 'off', 'Spot routed to P2 only is dark on P1');
    assert.strictEqual(computeConvergentSpotForProjector(spot, 2, mp).followspot.mode, 'beam', 'Routed projector still renders the spot');
    toggleSpotProjector(spot, 1);
    assert.deepStrictEqual(spot.projectors, [], 'Selecting every projector collapses back to "All"');
    state.spots = [spot];
    assert.strictEqual(beginSpotCalibration(spot.id, 1), true, 'Calibration starts on P1');
    assert.strictEqual(computeConvergentSpotForProjector(spot, 2, mp).followspot.mode, 'off', 'During calibration only the calibrated projector shows the spot');
    const before = computeConvergentSpotForProjector(spot, 1, mp).followspot.spotX;
    nudgeSpotCalibration(0.01, 0);
    assert(Math.abs(computeConvergentSpotForProjector(spot, 1, mp).followspot.spotX - before - 0.01) < 1e-6, 'Calibration trim shifts the spot on that projector');
    endSpotCalibration(true);
    assert(Math.abs(pL.spotTrim[0] - 0.01) < 1e-9 && !state.spotCalib.active, 'Trim is kept after calibration');
    const ser = serializeMultiProjectorState();
    assert(Math.abs(ser.screens[0].spotTrim[0] - 0.01) < 1e-9, 'Spot trims are saved with the projector rig');

    // Walk camera
    const sp = ensureStagePlanState(mp);
    setVenueCameraMode('walk');
    const cam = getVenueCamera(sp, 16 / 9);
    assert(cam.walk && Math.abs(cam.eye[1] - getVenueFloorHeightAt(cam.eye[0], cam.eye[2]) - 1.65) < 0.05, 'Walk camera stands at eye height');
    setVenueCameraMode('orbit');
  }
  console.log('✓ [17/17] Venue & Previz (Venue Types, Beam Range, People, DMX Lights in 3D, Effective Crops, 3D Spot Convergence, Routing & Calibration, Walk Camera) verified');
  // ==========================================================================
  // 18. Performance governor, pane solo/split, camera-relative spot steering,
  //     2D surfaces cast into the 3D venue (round trip) and Projector POV camera.
  // ==========================================================================
  {
    // Governor: slow frames step resolution down, sustained fast frames climb back.
    state.renderQuality = 'auto';
    perfGovernor.scale = 1; perfGovernor.emaMs = 16.7; perfGovernor.lastAdjust = 0; perfGovernor.ceiling = 1; perfGovernor.ceilingUntil = 0;
    let tNow = 10000;
    for (let i = 0; i < 400; i++) { tNow += 33; updatePerfGovernor(33, tNow); }
    assert.strictEqual(perfGovernor.scale, 0.5, 'Sustained 30 fps drops internal resolution to the 0.5 floor');
    for (let i = 0; i < 2000; i++) { tNow += 16.7; updatePerfGovernor(16.7, tNow); }
    assert.strictEqual(perfGovernor.scale, 1, 'Sustained 60 fps climbs back to full resolution');
    state.renderQuality = 'fast';
    updatePerfGovernor(16.7, tNow + 5000);
    assert.strictEqual(perfGovernor.scale, 0.5, 'FAST quality pins half resolution');
    state.renderQuality = 'auto';
    perfGovernor.scale = 1;

    // Pane solo state per room
    setStudioRoom('build');
    setBuildViewMode('split');
    assert.strictEqual(getPaneSoloState().solo, null, 'BUILD split has no solo pane');
    setBuildViewMode('warp');
    assert.strictEqual(getPaneSoloState().solo, 'stage', 'BUILD warp = stage pane solo');
    setBuildViewMode('plan2d');
    assert.strictEqual(getPaneSoloState().solo, 'rig', 'BUILD plan = rig pane solo');
    setBuildViewMode('split');

    // Stage UV → world (through the projector) → stage UV round trip
    const mp = ensureMultiProjectorState();
    const sp = ensureStagePlanState(mp);
    mp.enabled = false;
    mp.screens = [createProjectorScreenSlice(1, {})];
    solveStagePlanOpticalField(mp, true);
    const refs = getPrevizProjectorRefs();
    assert(refs.refs.length === 1, 'One projector reference for casting surfaces');
    const R = refs.refs[0];
    for (const uv of [[0.3, 0.2], [0.5, 0.5], [0.8, 0.7]]) {
      const P = castStageUvToWorld(uv[0], uv[1], R, []);
      const back = worldToStageUvViaRef(P, R);
      assert(Math.hypot(back[0] - uv[0], back[1] - uv[1]) < 1e-4, 'Surface corner survives the stage → venue → stage round trip');
    }
    const quad = createSurface('quad', {});
    const o3 = getShape3DOutline(quad, false, refs);
    assert(o3.closed && o3.world.length >= 16 && o3.corners.length === 4 && o3.corners.every(c => c && c.p), 'Quad outline is cast onto the venue with 4 corner anchors');

    // Projector POV camera: a stage point appears at the same place in the view as in the raster
    sp.camMode = 'pov';
    sp.povIndex = 1;
    const pov = getVenueCamera(sp, 16 / 9);
    assert(pov && pov.pov === 1, 'POV camera looks through P1');
    const P = castStageUvToWorld(0.25, 0.75, R, []);
    const c = venueClipPoint(P, pov.mvp);
    assert(Math.abs((c[0] / c[3]) * 0.5 + 0.5 - 0.25) < 1e-3 && Math.abs((c[1] / c[3]) * 0.5 + 0.5 - 0.75) < 1e-3, 'POV view is pixel-true to the projector raster');
    sp.camMode = 'orbit';

    // Camera-relative steering: viewed from stage-right (yaw 90°), mouse-right walks the
    // performer upstage (−Z) and mouse-up walks them away from the camera (−X).
    state.worldScreens = [createWorldScreen(1, { id: 'wscr_s', widthM: 6, heightM: 3.375, posM: [0, 2.3375, -2.6] })];
    state.worldProps = undefined; state._worldPropsSeeded = false;
    const perf = ensureWorldPropsState()[0];
    const spot = createSpotObject(0, { mode: 'beam', converge3D: true, followPropId: perf.id });
    sp.viewMode = 'orbit3d';
    state.layoutMode = 'rig';
    sp.orbitYaw = 90;
    const z0 = perf.posM[2], x0 = perf.posM[0];
    steerSpotInWorld(spot, 0.1, 0);
    assert(perf.posM[2] < z0 - 0.1 && Math.abs(perf.posM[0] - x0) < 1e-6, 'Steering right moves along the camera-right axis');
    steerSpotInWorld(spot, 0, 0.1);
    assert(perf.posM[0] < x0 - 0.1, 'Steering up moves away from the camera');
    const free = createSpotObject(1, { mode: 'beam', converge3D: true });
    sp.orbitYaw = 0;
    steerSpotInWorld(free, 0, 0);
    const fx0 = free.targetStageXM, fz0 = free.targetStageZM;
    steerSpotInWorld(free, 0.1, 0.1);
    assert(free.targetStageXM > fx0 && free.targetStageZM < fz0, 'Front view: right = stage-right, up = upstage (toward the screen)');
    // Inertia glide + aim height: the floor target is reached smoothly and aimed at body height.
    state.spots = [free];
    for (let i = 0; i < 120; i++) updateFollowspotPhysics(1 / 60);
    assert(Math.abs(free.stageXM - free.targetStageXM) < 0.02, 'Spot glides onto its floor target');
    const Tf = getSpotWorldTargetM(free);
    assert(Math.abs(Tf[1] - (getVenueFloorHeightAt(Tf[0], Tf[2]) + free.aimHeightM)) < 1e-6, 'Spot aims at body height above the deck/floor');
    // Fade: going to pre-aim keeps rendering the last live mode at a falling level.
    free.fadeSec = 1;
    free.mode = 'beam'; updateFollowspotPhysics(1 / 60); free._lvl = 1;
    free.mode = 'off';
    for (let i = 0; i < 30; i++) updateFollowspotPhysics(1 / 60);
    const fading = prepareSpotForRender(free);
    assert(fading.mode === 'beam' && free._lvl > 0.3 && free._lvl < 0.7, 'Fade-out keeps the beam alive at a falling level');
    for (let i = 0; i < 60; i++) updateFollowspotPhysics(1 / 60);
    assert.strictEqual(prepareSpotForRender(free).mode, 'off', 'After the fade the spot is dark');
    assert.strictEqual(steerSpotInWorld(createSpotObject(2, { converge3D: false }), 0.1, 0), false, 'Classic 2D spots keep screen-space steering');
  }
  console.log('✓ [18/18] Performance Governor, Pane Solo/Split, Surfaces Cast into the 3D Venue, Projector POV & Camera-Relative Steering verified');
  // ==========================================================================
  // 19. Unified 3D picking & selection, "Map onto" people/screens with live tracking,
  //     link persistence and the Orbital-Mix-not-on-stage detection.
  // ==========================================================================
  {
    const mp = ensureMultiProjectorState();
    mp.enabled = false;
    mp.screens = [createProjectorScreenSlice(1, {})];
    state.worldScreens = [createWorldScreen(1, { id: 'wscr_p', name: 'Pick Screen', widthM: 6, heightM: 3.375, posM: [0, 2.3375, -2.6] })];
    state.worldProps = undefined; state._worldPropsSeeded = false;
    const person = ensureWorldPropsState()[0];
    solveStagePlanOpticalField(mp, true);
    const eye = [person.posM[0], person.posM[1] + 1.1, 8];
    const toward = (P) => { const d = [P[0] - eye[0], P[1] - eye[1], P[2] - eye[2]]; const l = Math.hypot(...d); return d.map(n => n / l); };
    const hitPerson = pickVenueObjects(eye, toward([person.posM[0], person.posM[1] + 1.1, person.posM[2]]));
    assert(hitPerson && hitPerson.kind === 'world_prop' && hitPerson.id === person.id, 'Ray at the performer picks the person (in front of the screen)');
    const hitScreen = pickVenueObjects(eye, toward([-2.6, 3.4, -2.6]));
    assert(hitScreen && hitScreen.kind === 'world_screen', 'Ray at an empty part of the screen picks the screen');
    const P1 = mp.screens[0];
    const hitProj = pickVenueObjects([P1.posM[0] + 3, P1.posM[1], P1.posM[2]], [-1, 0, 0]);
    assert(hitProj && hitProj.kind === 'projector' && hitProj.id === '1', 'Ray at a projector body picks the projector');
    selectVenueObject('world_prop', person.id);
    assert(state.rigSelectedKind === 'world_prop' && state.selectedWorldPropId === person.id, '3D pick becomes the shared world selection');

    // Map onto the screen: an exact fill through the projector lens
    const nSurf = state.surfaces.length;
    const fill = mapMediaOntoObject('world_screen', 'wscr_p');
    assert(fill && fill.type === 'quad' && state.surfaces.length === nSurf + 1, 'Fill with surface creates a quad');
    const R = getPrevizProjectorRefs().refs[0];
    const bs = getWorldScreenBasis(state.worldScreens[0]);
    fill.points.forEach((p, k) => {
      const W = castStageUvToWorld(p[0], p[1], R, []);
      assert(Math.hypot(W[0] - bs.corners[k][0], W[1] - bs.corners[k][1], W[2] - bs.corners[k][2]) < 0.01, 'Screen fill corner lands on the physical screen corner');
    });
    assert.strictEqual(mapMediaOntoObject('world_screen', 'wscr_p'), fill, 'Mapping the same screen again selects the existing fill');

    // Map onto a person: silhouette polygon that follows them
    const sil = mapMediaOntoObject('world_prop', person.id);
    assert(sil && sil.type === 'polygon' && sil.points.length >= 6 && sil.linkObject.kind === 'prop', 'Map onto person creates a linked silhouette polygon');
    const before = JSON.stringify(sil.points);
    moveWorldPropTo(person, person.posM[0] + 1.0, person.posM[2]);
    solveStagePlanOpticalField(mp, true);
    updateLinkedObjectSurfaces();
    assert(JSON.stringify(sil.points) !== before && sil.points[0][0] > JSON.parse(before)[0][0] - 1, 'Silhouette surface follows the person');
    assert.deepStrictEqual(cloneSurfaceData(sil).linkObject, { kind: 'prop', id: person.id }, 'Link survives undo/cue/show cloning');

    // Orbital Mix: detect "not on stage"
    state.surfaces.forEach(s => { if (s.sourceId === 'bus:orbital' || s.sourceId === 'src_mixbus') s.sourceId = 'src_shards'; });
    (state.spots || []).forEach(sp => { sp.mode = 'off'; });
    assert.strictEqual(isMixbusOnStage(), false, 'Mix bus not used by any surface → radar warns it is not on stage');
    fill.sourceId = getMixbusSource().id;
    assert.strictEqual(isMixbusOnStage(), true, 'Routing a surface to the mix bus puts it on stage');
  }
  console.log('✓ [19/19] Unified 3D Picking, Map-Onto People & Screens (exact fill, live tracking), Link Persistence & Mix-on-Stage Detection verified');

  // ==========================================================================
  // 20. v2.2: Program/Preview hold & TAKE, orthographic views, venue parts
  //     (oriented boxes: raycast, walkable, face mapping), point calibration
  //     (LM pose solve), contexts & rehearsal takes.
  // ==========================================================================
  {
    // Program / Preview
    state.program = undefined;
    ensureProgramState();
    state.room = 'live';
    onRoomChangedForProgram('live', 'map');
    state.room = 'map';
    assert(isProgramHeld(), 'LIVE → MAP holds the stage on Program (Blind)');
    const s0 = state.surfaces[0];
    const heldOpacity = state.program.snap.surfaces.find(x => x.id === s0.id).opacity;
    s0.opacity = 0.123;
    assert(hasPendingPreviewEdits(true), 'A Preview edit is detected as pending');
    const pl = applyHeldProgramToSyncPayload({ shaders: {}, isfRuntimeStates: {} });
    assert(pl.programHeld && pl.surfaces.find(x => x.id === s0.id).opacity === heldOpacity, 'Projector payload carries the held Program look, not the Preview edit');
    revertPreviewToProgram();
    assert.strictEqual(state.surfaces[0].opacity, heldOpacity, 'Revert restores the Program look in the operator view');
    s0.opacity = 0.5;
    takeProgram(1.5);
    assert(!isProgramHeld() && state.crossfade.active && state.crossfade.fromScene && state.crossfade.duration === 1.5, 'TAKE dissolves Program → Preview with the take fade');
    state.crossfade.active = false; state.crossfade.fromScene = null;
    holdProgram({ silent: true });
    state.room = 'live';
    onRoomChangedForProgram('map', 'live');
    assert(!isProgramHeld(), 'Arriving in LIVE with nothing pending releases the hold');

    // Orthographic views
    const sp = ensureStagePlanState(ensureMultiProjectorState());
    setVenueOrthoView('front');
    const camF = getVenueCamera(sp, 16 / 9);
    assert(camF.ortho === 'front' && camF.orthoHalfH > 0, 'Front orthographic camera');
    const rayA = venueScreenRay(camF, 0.2, 0.5), rayB = venueScreenRay(camF, 0.8, 0.5);
    assert(Math.abs(rayA.dir[2] + 1) < 1e-4 && Math.abs(rayB.dir[2] + 1) < 1e-4, 'Ortho rays are parallel (looking -Z)');
    setVenueOrthoView('top');
    const camT = getVenueCamera(sp, 16 / 9);
    assert(camT.up[2] === -1 && Math.abs(camT.right[0] - 1) < 1e-9, 'Top view: screen-up = upstage (-Z), right = +X');
    setVenueCameraMode('orbit');

    // Venue parts
    state.venueParts = [];
    const blk = addVenuePart('block', { posM: [6, 0, 6], sizeM: [2, 1, 2], yawDeg: 45 });
    const lay = getVenueLayout();
    assert(lay.boxes.some(b => b.partId === blk.id && b.obb), 'Part joins the venue layout as an oriented box');
    const hit = raycastVenueLayout(6, 5, 6, 0, -1, 0);
    assert(hit && Math.abs(hit.t - 4) < 1e-6 && hit.partId === blk.id, 'Beams stop on the part top (t = 4 m)');
    const corner = [6 + 1.3, 5, 6 + 1.3]; // inside the AABB, outside the 45° diamond
    assert(!raycastVenueLayout(corner[0], corner[1], corner[2], 0, -1, 0) || raycastVenueLayout(corner[0], corner[1], corner[2], 0, -1, 0).partId !== blk.id, 'Rotated box: the old AABB corner is empty');
    const plat = addVenuePart('platform', { posM: [-6, 0, 6], sizeM: [2, 0.5, 2] });
    assert(Math.abs(getVenueFloorHeightAt(-6, 6) - 0.5) < 1e-9, 'Platforms are walkable');
    const face = getVenuePartFaceCorners(blk, '+z');
    const n = face.normal;
    assert(Math.abs(n[0] + Math.SQRT1_2) < 1e-6 && Math.abs(n[2] - Math.SQRT1_2) < 1e-6, 'Front face normal follows yaw');
    const picked = pickVenueObjects([6, 0.5, 12], [0, 0, -1]);
    assert(picked && picked.kind === 'venue_part' && picked.id === blk.id, 'Parts are pickable in 3D');
    const snapU = captureUndoSnapshot();
    removeVenuePart(plat.id);
    restoreUndoSnapshot(snapU);
    assert(state.venueParts.some(p => p.id === plat.id), 'Venue parts survive undo');
    const saved = JSON.parse(JSON.stringify(serializeShowData(false)));
    assert(Array.isArray(saved.venueParts) && saved.venueParts.length === 2, 'Venue parts are saved with the show');
    state.venueParts = [];
    markVenuePartsDirty();

    // Point calibration: recover a perturbed projector pose from 6 pins
    const scr = ensureMultiProjectorState().screens[0];
    scr.posM = [0, 2.4, 6]; scr.aimM = [0, 2.2, -2.6]; scr.rollDeg = 0; scr.throwRatio = 1.3;
    const truth = alignParamsFromProjector(scr);
    const res = getProjectorNativeRes();
    const pts = [[-3, 0.6, -2.6], [3, 0.6, -2.6], [3, 4, -2.6], [-3, 4, -2.6], [-2, 0.6, 0.5], [2.5, 0.6, 0.5]];
    const pins = pts.map(w => { const uv = alignProject(truth, w, scr, res[0] / res[1]); return { world: w, pu: uv[0], pv: uv[1] }; });
    scr.posM = [0.5, 2.1, 6.7]; scr.aimM = [-0.6, 2.5, -2.6]; scr.rollDeg = 3; scr.throwRatio = 1.4;
    const sol = solveProjectorPoseFromPins(scr, pins);
    assert(sol.rmsPx < 0.05, 'LM point calibration converges (RMS < 0.05 px)');
    assert(Math.abs(sol.params[0] - truth[0]) < 0.01 && Math.abs(sol.params[2] - truth[2]) < 0.01 && Math.abs(Math.exp(sol.params[6]) - 1.3) < 0.005, 'Solved position and throw match the truth');

    // Contexts & rehearsal takes
    applyWorkflowContext('architectural');
    assert(state.workflow === 'architectural' && state.venueParts.some(p => p.kind === 'building') && state.worldStage.shape === 'open_ground', 'Architectural context builds a facade on open ground');
    applyWorkflowContext('club');
    assert(state.program.autoBlind === false, 'Club context: edits go live (no auto Blind)');
    const nc = state.cues.length;
    const take = keepRehearsalTake();
    assert(state.cues.length === nc + 1 && take.take && take.cueRole === 'deck', 'Keep take stores an out-of-sequence take cue');
  }
  console.log('✓ [20/20] v2.2 Program/Preview TAKE, Orthographic Views, Venue Parts, Point Calibration (LM) & Contexts verified');

  // ==========================================================================
  // 21. Chaos CathodeRay 0.1 beta: identity & compatibility, one view model
  //     (Plan / sides / Lines look), Show Check, problem report.
  // ==========================================================================
  {
    assert(APP_NAME === 'Chaos CathodeRay' && /^0\.1\.0/.test(APP_VERSION), 'App identity is Chaos CathodeRay 0.1.0');
    assert(window.ChaosCathodeRayAPI && window.WebMapperAPI === window.ChaosCathodeRayAPI, 'ChaosCathodeRayAPI with the legacy WebMapperAPI alias');
    assert.strictEqual(normalizeOscAddress('/chaos/cue/go'), '/webmapper/cue/go', 'OSC /chaos/… maps onto the command set');
    assert.strictEqual(normalizeOscAddress('/webmapper/cue/go'), '/webmapper/cue/go', 'Legacy OSC /webmapper/… still works');
    const before = state.masterOpacity;
    dispatchOscCommand('/chaos/master/opacity', [0.42]);
    assert(Math.abs(state.masterOpacity - 0.42) < 1e-5, 'OSC /chaos/master/opacity drives the Grand Master');
    state.masterOpacity = before;
    const show = serializeShowData(false);
    assert(show.format === APP_SHOW_FORMAT && show.appVersion === APP_VERSION, 'New shows save as chaoscathode-show with the app version');
    const legacy = JSON.parse(JSON.stringify(show)); legacy.format = 'webmapper-show';
    assert.strictEqual(importShowJson(JSON.stringify(legacy), true), true, 'Old WebMapper show files still load');

    // One view model: Plan in the 3D Venue = Top in the Lines look; sides keep the look.
    const sp = ensureStagePlanState(ensureMultiProjectorState());
    state.room = 'map'; state.layoutMode = 'split';
    setVenueCameraMode('plan');
    assert(sp.camMode === 'ortho' && sp.orthoView === 'top' && getVenueViewLook(sp) === 'lines', 'Plan (MAP/LIVE) = Top view, Lines look');
    setVenueOrthoView('front');
    assert(getVenueViewLook(sp) === 'lines', 'Lines look carries over to elevations');
    setVenueViewLook('light');
    assert(getVenueViewLook(sp) === 'light', 'Light look renders the venue');
    setVenueCameraMode('orbit');
    assert(getVenueViewLook(sp) === 'light', 'Perspective is always the Light look');
    // The drawer runs on a stub 2D context without throwing.
    const calls = { line: 0, text: 0 };
    const ctx2 = new Proxy({}, { get: (t, k) => k === 'measureText' ? (() => ({ width: 20 })) : (k === 'lineTo' ? () => { calls.line++; } : (k === 'fillText' ? () => { calls.text++; } : (t[k] !== undefined ? t[k] : () => {}))), set: (t, k, v) => { t[k] = v; return true; } });
    setVenueOrthoView('left');
    drawVenueLinesOverlay(ctx2, getVenueCamera(sp, 16 / 9), 800, 450);
    assert(calls.line > 20 && calls.text > 5, 'Lines look draws outlines, grid and dimension labels');
    setVenueCameraMode('orbit');

    // Parts count as mapping targets: no false "beam misses" on a facade.
    applyWorkflowContext('architectural');
    const field = solveStagePlanOpticalField(state.multiProjector);
    const p1 = state.multiProjector.screens[0];
    assert(field.opticsByIndex.get(p1.index).missesAllTargets === false, 'A projector aimed at a facade part is not flagged as missing');

    // Show Check
    state.blackout = true;
    let items = collectShowCheckItems();
    assert(items.some(i => i.id === 'blackout' && i.level === 'warn'), 'Show Check flags blackout');
    items.find(i => i.id === 'blackout').fix();
    assert(state.blackout === false, 'Show Check fix releases blackout');
    state.workflow = 'theatre';
    const savedCues = state.cues; state.cues = [];
    items = collectShowCheckItems();
    assert(items.some(i => i.id === 'cues'), 'Theatre with no cues is flagged');
    state.cues = savedCues;
    markShowSavedToFile();
    assert(!collectShowCheckItems().some(i => i.id === 'save'), 'Saving a file clears the save reminder');

    // Problem report
    logBetaError('error', 'Test failure XYZ', 'x.js:1:1');
    const rep = buildBetaReportText('clicked GO');
    assert(rep.includes(APP_VERSION) && rep.includes('clicked GO') && rep.includes('Test failure XYZ') && rep.includes('SHOW CHECK'), 'Report carries version, note, errors and Show Check');
    assert(!rep.includes('Voronoi') && !rep.includes('Center Monolith'), 'Report contains counts only, no media or surface names');
    const mail = buildBetaReportMailto(rep);
    assert(/^\\d{6}-\\d{4}$/.test(makeBetaReportId(new Date(2025, 10, 12, 14, 15))) && makeBetaReportId(new Date(2025, 10, 12, 14, 15)) === '251112-1415', 'Report number = yymmdd-hhmm');
    assert(rep.startsWith(APP_REPORT_SUBJECT + ' ' + getBetaReportId()), 'Report opens with its subject line');
    const payload = JSON.parse(buildBetaReportPayload(rep));
    assert(payload.app === 'chaos-cathoderay' && payload.id === getBetaReportId() && payload.report === rep && payload.website === '', 'Server payload matches chaos-report.php');
    assert(mail.url.startsWith('mailto:' + APP_FEEDBACK_EMAIL + '?subject=' + encodeURIComponent(APP_REPORT_SUBJECT + ' ' + getBetaReportId())) && decodeURIComponent(mail.url).includes('clicked GO') && !mail.truncated, 'Email fallback uses the same subject and report');
    // Licence: AGPL identity, plugins stay the author's, legal notices carry copyright + attribution.
    assert(APP_LICENSE === 'AGPL-3.0-or-later' && APP_COPYRIGHT.includes("Jonathan O'Hear") && APP_ATTRIBUTION.startsWith('Based on Chaos CathodeRay ('), 'Licence identity: AGPL-3.0-or-later, copyright & attribution');
    const fxLic = registerCustomFxPlugin({ name: 'Lic Test FX', isfCode: '/*{"INPUTS":[{"NAME":"inputImage","TYPE":"image"}]}*/ void main(){ gl_FragColor = IMG_THIS_PIXEL(inputImage); }' });
    assert(fxLic.ok && fxLic.plugin.license === 'unspecified', 'User plugins get no assumed licence');
    // Fresh start: the saved session is summarised, then everything this browser remembers is wiped.
    const memStore = new Map();
    globalThis.localStorage = { getItem: k => (memStore.has(k) ? memStore.get(k) : null), setItem: (k, v) => memStore.set(k, String(v)), removeItem: k => memStore.delete(k) };
    localStorage.setItem(AUTOSAVE_STORAGE_KEY, JSON.stringify(serializeShowData(false)));
    localStorage.setItem(START_SEEN_KEY, 'show');
    localStorage.setItem('wm.renderQuality', 'fast');
    const info = readSavedSessionInfo();
    assert(info && info.surfaces === state.surfaces.length && info.cues === state.cues.length && info.savedAt, 'Welcome-back summary reads the saved session');
    await wipeSavedSession();
    assert(memStore.size === 0 && readSavedSessionInfo() === null, 'Start fresh forgets the session, start-screen choice and settings');
    state._resetting = false;
    delete globalThis.localStorage;
    const big = buildBetaReportMailto(rep + 'x'.repeat(20000));
    assert(big.truncated && big.url.length < 9000 && decodeURIComponent(big.url).includes('full report is on your clipboard'), 'Long reports are shortened for email with a paste hint');
  }
  console.log('✓ [21/21] Chaos CathodeRay 0.1 beta: identity & compatibility, Plan/sides/Lines view model, Show Check & problem report verified');
  console.log('\\n🎉 ALL 21/21 CHAOS CATHODERAY 0.1.0-BETA AUTOMATED SUITES PASSED (0 ERRORS)');
})().catch(err => {
  console.error('TEST FAILURE:', err);
  process.exit(1);
});
`;

class HeadlessSvgDOMParser {
  parseFromString(xml) {
    function parseAttrs(attrStr) {
      const map = new Map();
      for (const m of attrStr.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)) {
        map.set(m[1], m[2]);
      }
      return map;
    }
    function makeEl(tag, attrs, children = []) {
      return {
        nodeType: 1,
        tagName: tag,
        children,
        childNodes: children,
        getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; }
      };
    }
    const svgOpen = xml.match(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/i);
    if (!svgOpen) return { querySelector() { return null; } };
    const kids = [];
    for (const m of svgOpen[2].matchAll(/<([\w:-]+)\b([^>]*?)\/>/g)) {
      kids.push(makeEl(m[1], parseAttrs(m[2])));
    }
    const rootEl = makeEl('svg', parseAttrs(svgOpen[1]), kids);
    return { querySelector(sel) { return sel === 'svg' ? rootEl : null; } };
  }
}

vm.runInNewContext(vmScript, {
  DOMParser: HeadlessSvgDOMParser,
  Buffer,
  Uint8Array,
  Uint8ClampedArray,
  Int32Array,
  Float32Array,
  DataView,
  ArrayBuffer,
  TextEncoder,
  TextDecoder,
  URLSearchParams,
  URL,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  encodeURIComponent,
  decodeURIComponent,
  Math,
  Date,
  JSON,
  Promise,
  Set,
  Map,
  WeakMap,
  RegExp,
  Number,
  String,
  Boolean,
  Array,
  Object,
  Error,
  console,
  assert,
  process,
  performance: { now: () => 1000 },
  setTimeout,
  clearTimeout,
  bridge,
  net: require('net'),
  http: require('http'),
  crypto: require('crypto')
});
