#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
/**
 * Generates WebMapper's two 100%-verified H.264 + AAC (.mp4) Demo Videos:
 *   1. demos/demo-1-kinetic-drums-120bpm.mp4  (Standalone HD 960x540 .mp4)
 *   2. demos/demo-2-stage-beams-128bpm.mp4    (Standalone HD 960x540 .mp4)
 *   3. src/03d-demo-videos.js                 (Compact 480x270 embedded .mp4 clips + 1-click loader)
 */
'use strict';

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.resolve(__dirname, '..');
const demosDir = path.join(root, 'demos');
const outJsPath = path.join(root, 'src', '03d-demo-videos.js');

fs.mkdirSync(demosDir, { recursive: true });

const hardTimeout = setTimeout(() => {
  console.error('Timed out generating demo videos');
  process.exit(1);
}, 25000);

const profDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-demogen-'));
const port = 9462;

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profDir}`,
  '--autoplay-policy=no-user-gesture-required',
  '--no-first-run',
  'about:blank'
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const fetchJson = url => new Promise((resolve, reject) => {
  http.get(url, res => {
    let d = '';
    res.on('data', c => { d += c; });
    res.on('end', () => {
      try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
    });
  }).on('error', reject);
});

(async () => {
  try {
    let targets = null;
    for (let i = 0; i < 30; i++) {
      try {
        targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
        if (targets && targets.find(t => t.type === 'page')) break;
      } catch (_) {}
      await sleep(120);
    }
    const page = targets && targets.find(t => t.type === 'page');
    if (!page) throw new Error('Could not attach to headless Chrome page');

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let idSeq = 1;
    const pending = new Map();
    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    };
    const send = (method, params = {}) => new Promise(res => {
      const id = idSeq++;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
    });

    await send('Runtime.enable');

    const evalRes = await send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async () => {
        const mimeCandidates = [
          'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
          'video/mp4;codecs=avc1,mp4a.40.2',
          'video/mp4'
        ];
        const mimeType = mimeCandidates.find(t => MediaRecorder.isTypeSupported(t));
        if (!mimeType) throw new Error('H.264+AAC MP4 MediaRecorder not supported');

        async function recordSynthClip(opts) {
          const { width, height, durationSec, bpm, style, videoBitsPerSecond, audioBitsPerSecond } = opts;
          const cvs = document.createElement('canvas');
          cvs.width = width;
          cvs.height = height;
          const ctx = cvs.getContext('2d');

          const actx = new AudioContext({ sampleRate: 48000 });
          await actx.resume();
          const streamDest = actx.createMediaStreamDestination();
          const master = actx.createGain();
          master.gain.value = 0.85;
          master.connect(streamDest);

          // White-noise buffer for punchy snare & crisp 4-12kHz hi-hats (lights up MID + HI FFT bands!)
          const noiseBuf = actx.createBuffer(1, actx.sampleRate * 1, actx.sampleRate);
          const nd = noiseBuf.getChannelData(0);
          for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

          const beatDur = 60 / bpm;
          const totalBeats = Math.round(durationSec / beatDur);
          const t0 = actx.currentTime + 0.04;

          for (let step = 0; step < totalBeats * 4; step++) {
            const st = t0 + step * (beatDur * 0.25);
            const isBeat = (step % 4) === 0;
            const beatIdx = Math.floor(step / 4);

            // 1. SUB + LOW: Punchy pitch-swept kick drum on every quarter-note beat (45Hz-150Hz)
            if (isBeat || (style === 'beams' && step % 8 === 6)) {
              const kOsc = actx.createOscillator();
              const kGain = actx.createGain();
              kOsc.type = 'sine';
              kOsc.frequency.setValueAtTime(155, st);
              kOsc.frequency.exponentialRampToValueAtTime(48, st + 0.09);
              kOsc.frequency.exponentialRampToValueAtTime(38, st + 0.24);
              kGain.gain.setValueAtTime(0.95, st);
              kGain.gain.exponentialRampToValueAtTime(0.001, st + 0.26);
              kOsc.connect(kGain);
              kGain.connect(master);
              kOsc.start(st);
              kOsc.stop(st + 0.27);
            }

            // 2. LOW + MID: Driving sawtooth/triangle bass & synth arpeggio (110Hz - 1320Hz)
            const bassNotes = style === 'drums'
              ? [55, 55, 82.41, 73.42, 65.41, 65.41, 98.0, 82.41]
              : [65.41, 65.41, 77.78, 87.31, 98.0, 87.31, 77.78, 130.81];
            const bFreq = bassNotes[step % bassNotes.length];
            const bOsc = actx.createOscillator();
            const bFilt = actx.createBiquadFilter();
            const bGain = actx.createGain();
            bOsc.type = 'sawtooth';
            bOsc.frequency.setValueAtTime(bFreq * (step % 2 === 1 ? 2 : 1), st);
            bFilt.type = 'lowpass';
            bFilt.frequency.setValueAtTime(style === 'drums' ? 950 : 1450, st);
            bFilt.Q.value = 3.5;
            bGain.gain.setValueAtTime(0.32, st);
            bGain.gain.exponentialRampToValueAtTime(0.02, st + beatDur * 0.23);
            bOsc.connect(bFilt);
            bFilt.connect(bGain);
            bGain.connect(master);
            bOsc.start(st);
            bOsc.stop(st + beatDur * 0.24);

            // Bright MID synth chord / arp stab (330Hz - 1760Hz)
            const arpNotes = style === 'drums'
              ? [440, 554.37, 659.25, 880, 659.25, 554.37, 493.88, 739.99]
              : [523.25, 659.25, 783.99, 1046.5, 783.99, 987.77, 1174.66, 1567.98];
            const mOsc = actx.createOscillator();
            const mGain = actx.createGain();
            mOsc.type = style === 'drums' ? 'triangle' : 'square';
            mOsc.frequency.setValueAtTime(arpNotes[step % arpNotes.length], st);
            mGain.gain.setValueAtTime(step % 2 === 0 ? 0.24 : 0.16, st);
            mGain.gain.exponentialRampToValueAtTime(0.008, st + beatDur * 0.22);
            mOsc.connect(mGain);
            mGain.connect(master);
            mOsc.start(st);
            mOsc.stop(st + beatDur * 0.23);

            // 3. MID + HI: Snare on beats 2 & 4 + crisp 16th-note hi-hats (3.5kHz - 11kHz)
            const isSnare = (step % 8) === 4;
            const nSrc = actx.createBufferSource();
            nSrc.buffer = noiseBuf;
            const hpf = actx.createBiquadFilter();
            hpf.type = isSnare ? 'bandpass' : 'highpass';
            hpf.frequency.value = isSnare ? 2400 : 6200;
            hpf.Q.value = isSnare ? 0.9 : 0.7;
            const nGain = actx.createGain();
            const durN = isSnare ? 0.16 : ((step % 2 === 0) ? 0.075 : 0.045);
            nGain.gain.setValueAtTime(isSnare ? 0.50 : 0.28, st);
            nGain.gain.exponentialRampToValueAtTime(0.002, st + durN);
            nSrc.connect(hpf);
            hpf.connect(nGain);
            nGain.connect(master);
            nSrc.start(st);
            nSrc.stop(st + durN + 0.01);
          }

          let animRunning = true;
          const startWall = performance.now();
          function drawFrame() {
            const elapsed = (performance.now() - startWall) / 1000;
            const beatPhase = (elapsed / beatDur) % 1;
            const pulse = Math.pow(Math.max(0, 1 - beatPhase * 2.2), 2);

            ctx.fillStyle = style === 'drums' ? '#050914' : '#070412';
            ctx.fillRect(0, 0, width, height);

            if (style === 'drums') {
              // Perspective neon mapping grid + beat-reactive concentric rings
              ctx.strokeStyle = 'rgba(111, 211, 255, ' + (0.18 + 0.35 * pulse) + ')';
              ctx.lineWidth = Math.max(1, width / 480);
              const stepG = width / 12;
              for (let x = 0; x <= width; x += stepG) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
              }
              for (let y = 0; y <= height; y += stepG) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
              }
              const cx = width * 0.5, cy = height * 0.5;
              const colors = ['#ff5e8e', '#ffcb6b', '#4deeea', '#34e89e'];
              for (let r = 0; r < 4; r++) {
                const rad = (Math.min(width, height) * (0.12 + r * 0.095)) * (1 + pulse * (0.22 - r * 0.03));
                ctx.strokeStyle = colors[r];
                ctx.lineWidth = Math.max(2, (width / 160) * (1.1 + pulse));
                ctx.beginPath();
                ctx.arc(cx, cy, rad, elapsed * (r % 2 ? -1.8 : 2.1), elapsed * (r % 2 ? -1.8 : 2.1) + Math.PI * 1.55);
                ctx.stroke();
              }
              // Corner calibration chevrons
              ctx.fillStyle = 'rgba(52, 232, 158, ' + (0.45 + 0.55 * pulse) + ')';
              const m = width * 0.04, s = width * 0.035;
              ctx.fillRect(m, m, s, 4); ctx.fillRect(m, m, 4, s);
              ctx.fillRect(width - m - s, m, s, 4); ctx.fillRect(width - m - 4, m, 4, s);
              ctx.fillRect(m, height - m - 4, s, 4); ctx.fillRect(m, height - m - s, 4, s);
              ctx.fillRect(width - m - s, height - m - 4, s, 4); ctx.fillRect(width - m - 4, height - m - s, 4, s);
            } else {
              // Volumetric stage light cones ("Video as Light" demo!)
              ctx.save();
              ctx.globalCompositeOperation = 'lighter';
              const beamColors = [
                ['rgba(52, 232, 158, 0.52)', 'rgba(52, 232, 158, 0)'],
                ['rgba(111, 211, 255, 0.52)', 'rgba(111, 211, 255, 0)'],
                ['rgba(196, 125, 255, 0.50)', 'rgba(196, 125, 255, 0)'],
                ['rgba(255, 190, 95, 0.45)', 'rgba(255, 190, 95, 0)']
              ];
              for (let b = 0; b < 4; b++) {
                const ox = width * (0.16 + b * 0.226);
                const oy = height * 0.04;
                const sway = Math.sin(elapsed * 2.4 + b * 1.4) * width * 0.18;
                const tx = ox + sway;
                const spread = width * (0.13 + 0.06 * pulse);
                const grad = ctx.createLinearGradient(ox, oy, tx, height);
                grad.addColorStop(0, beamColors[b][0]);
                grad.addColorStop(1, beamColors[b][1]);
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.moveTo(ox - 6, oy);
                ctx.lineTo(ox + 6, oy);
                ctx.lineTo(tx + spread, height);
                ctx.lineTo(tx - spread, height);
                ctx.closePath();
                ctx.fill();
              }
              // Stage floor followspot pool
              const spotX = width * (0.5 + 0.28 * Math.sin(elapsed * 1.9));
              const spotY = height * 0.78;
              const rg = ctx.createRadialGradient(spotX, spotY, 2, spotX, spotY, width * (0.16 + 0.05 * pulse));
              rg.addColorStop(0, 'rgba(255,255,255,0.85)');
              rg.addColorStop(0.45, 'rgba(111,211,255,0.42)');
              rg.addColorStop(1, 'rgba(0,0,0,0)');
              ctx.fillStyle = rg;
              ctx.beginPath();
              ctx.ellipse(spotX, spotY, width * 0.19, height * 0.08, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }

            ctx.fillStyle = 'rgba(255,255,255,0.82)';
            ctx.font = '700 ' + Math.max(11, Math.round(width / 38)) + 'px ui-monospace, monospace';
            ctx.fillText(
              style === 'drums' ? 'WEBMAPPER DEMO 1 • KINETIC DRUMS 120 BPM' : 'WEBMAPPER DEMO 2 • STAGE BEAMS 128 BPM',
              width * 0.05,
              height * 0.93
            );
          }

          drawFrame();
          const drawTimer = setInterval(() => { if (animRunning) drawFrame(); }, 1000 / 30);

          const vStream = cvs.captureStream(30);
          const mixed = new MediaStream([
            ...vStream.getVideoTracks(),
            ...streamDest.stream.getAudioTracks()
          ]);
          const rec = new MediaRecorder(mixed, {
            mimeType,
            videoBitsPerSecond,
            audioBitsPerSecond
          });
          const chunks = [];
          rec.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
          rec.start();
          await new Promise(r => setTimeout(r, durationSec * 1000));
          animRunning = false;
          clearInterval(drawTimer);
          rec.stop();
          await new Promise(r => { rec.onstop = r; });
          vStream.getTracks().forEach(t => t.stop());
          await actx.close();

          const blob = new Blob(chunks, { type: 'video/mp4' });
          const ab = await blob.arrayBuffer();

          // Verify decoded audio peak with OfflineAudioContext right away!
          const off = new OfflineAudioContext(2, 44100, 44100);
          const decoded = await off.decodeAudioData(ab.slice(0));
          const ch = decoded.getChannelData(0);
          let peak = 0;
          for (let i = 0; i < ch.length; i += 8) {
            const a = Math.abs(ch[i]);
            if (a > peak) peak = a;
          }

          const bytes = new Uint8Array(ab);
          let bin = '';
          const step = 0x8000;
          for (let i = 0; i < bytes.length; i += step) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
          }
          return {
            base64: btoa(bin),
            byteLength: bytes.length,
            audioDuration: decoded.duration,
            audioPeak: peak
          };
        }

        const hd1 = await recordSynthClip({
          width: 960, height: 540, durationSec: 3.0, bpm: 120, style: 'drums',
          videoBitsPerSecond: 1400000, audioBitsPerSecond: 128000
        });
        const hd2 = await recordSynthClip({
          width: 960, height: 540, durationSec: 2.8125, bpm: 128, style: 'beams',
          videoBitsPerSecond: 1400000, audioBitsPerSecond: 128000
        });
        const emb1 = await recordSynthClip({
          width: 480, height: 270, durationSec: 2.0, bpm: 120, style: 'drums',
          videoBitsPerSecond: 260000, audioBitsPerSecond: 96000
        });
        const emb2 = await recordSynthClip({
          width: 480, height: 270, durationSec: 1.875, bpm: 128, style: 'beams',
          videoBitsPerSecond: 260000, audioBitsPerSecond: 96000
        });

        return { mimeType, hd1, hd2, emb1, emb2 };
      })()`
    });

    if (evalRes.result?.exceptionDetails) {
      throw new Error('Browser exception: ' + JSON.stringify(evalRes.result.exceptionDetails));
    }
    const out = evalRes.result?.result?.value;
    if (!out || !out.hd1 || !out.emb1) {
      throw new Error('Unexpected generator output: ' + JSON.stringify(evalRes));
    }

    const demo1Path = path.join(demosDir, 'demo-1-kinetic-drums-120bpm.mp4');
    const demo2Path = path.join(demosDir, 'demo-2-stage-beams-128bpm.mp4');
    fs.writeFileSync(demo1Path, Buffer.from(out.hd1.base64, 'base64'));
    fs.writeFileSync(demo2Path, Buffer.from(out.hd2.base64, 'base64'));

    const jsModule = `// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
// ============================================================================
// 03d-demo-videos.js — Built-In 100%-Verified H.264 + AAC (.mp4) Demo Videos
// Works offline over file:// in 1 click (speakers + 4-band WebAudio FFT + Beat)
// Standalone HD versions also live in ./demos/ for drag-and-drop testing.
// ============================================================================

const BUILT_IN_DEMO_VIDEOS = Object.freeze({
  drums: Object.freeze({
    key: 'drums',
    name: 'Demo 1 — Kinetic Drums (120 BPM)',
    fileName: 'demo-1-kinetic-drums-120bpm.mp4',
    mimeType: 'video/mp4',
    bpm: 120,
    dataUrl: 'data:video/mp4;base64,${out.emb1.base64}'
  }),
  beams: Object.freeze({
    key: 'beams',
    name: 'Demo 2 — Stage Beams (128 BPM)',
    fileName: 'demo-2-stage-beams-128bpm.mp4',
    mimeType: 'video/mp4',
    bpm: 128,
    dataUrl: 'data:video/mp4;base64,${out.emb2.base64}'
  })
});

async function loadBuiltInDemoVideo(demoKey = 'drums', unmuteAndEnableFft = true) {
  const spec = BUILT_IN_DEMO_VIDEOS[demoKey] || BUILT_IN_DEMO_VIDEOS.drums;
  if (!spec) return null;

  let vSrc = state.sources.find(s => s && s.kind === 'video' && !s.offline && s.demoKey === spec.key);
  if (!vSrc) {
    const file = typeof dataUrlToFile === 'function'
      ? dataUrlToFile(spec.dataUrl, spec.fileName, spec.mimeType)
      : null;
    if (!file) {
      showToast('Demo video unpack unavailable in this browser');
      return null;
    }
    state._unmuteNextImportedVideo = !!unmuteAndEnableFft;
    vSrc = addVideoSourceFromFile(file);
    if (vSrc) {
      vSrc.name = spec.name;
      vSrc.demoKey = spec.key;
      vSrc.clipBpm = spec.bpm;
      vSrc.targetBpm = spec.bpm;
    }
  } else {
    vSrc.playing = true;
    if (unmuteAndEnableFft) {
      vSrc.muted = false;
      if ((vSrc.volume ?? 0.85) <= 0.05) vSrc.volume = 0.85;
    }
    assignOrActivateNewSource(vSrc);
  }

  if (!vSrc) return null;

  if (unmuteAndEnableFft) {
    vSrc.muted = false;
    if ((vSrc.volume ?? 0.85) <= 0.05) vSrc.volume = 0.85;
    if (typeof syncVideoAudioElementState === 'function') {
      syncVideoAudioElementState(vSrc, true);
    } else if (vSrc.video) {
      vSrc.video.muted = false;
      vSrc.video.volume = vSrc.volume;
    }
    if (state.audio) {
      state.audio.bpm = spec.bpm;
      state.audio.videoSourceId = vSrc.id;
      if (typeof enableAudioAnalyzer === 'function') {
        await enableAudioAnalyzer('video');
      }
    }
  }

  if (typeof renderMediaBin === 'function') renderMediaBin();
  if (typeof renderSurfaceList === 'function') renderSurfaceList();
  if (typeof syncTransportUI === 'function') syncTransportUI();
  if (typeof syncModIoInspectorUI === 'function') syncModIoInspectorUI();
  if (!state.isProjectorRole && typeof scheduleAutosave === 'function') scheduleAutosave();

  showToast(\`🎬 Loaded "\${spec.name}" — 🔊 Sound + Live 4-Band FFT Active!\`);
  return vSrc;
}
`;
    fs.writeFileSync(outJsPath, jsModule, 'utf8');

    console.log(
      `✓ Generated Demo 1 HD: ${(out.hd1.byteLength / 1024).toFixed(1)} KB (peak=${out.hd1.audioPeak.toFixed(2)}, dur=${out.hd1.audioDuration.toFixed(2)}s)\n` +
      `✓ Generated Demo 2 HD: ${(out.hd2.byteLength / 1024).toFixed(1)} KB (peak=${out.hd2.audioPeak.toFixed(2)}, dur=${out.hd2.audioDuration.toFixed(2)}s)\n` +
      `✓ Generated src/03d-demo-videos.js (embedded=${((out.emb1.byteLength + out.emb2.byteLength) / 1024).toFixed(1)} KB raw)`
    );
    ws.close();
  } finally {
    clearTimeout(hardTimeout);
    try { chrome.kill('SIGKILL'); } catch (_) {}
    setTimeout(() => {
      try { fs.rmSync(profDir, { recursive: true, force: true }); } catch (_) {}
    }, 150);
  }
})().catch(err => {
  console.error('Demo generation failed:', err);
  try { chrome.kill('SIGKILL'); } catch (_) {}
  try { fs.rmSync(profDir, { recursive: true, force: true }); } catch (_) {}
  process.exit(1);
});
