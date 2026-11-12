#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
'use strict';

/**
 * WebMapper Zero-Dependency Local Hardware Bridge:
 *   1. Bi-Directional OSC 1.0 UDP <-> WebSocket
 *   2. Art-Net 4 OpDmx UDP 6454 Output (Loopback Studio Only)
 *   3. PJLink Class 1 & 2 TCP 4352 Ethernet Video-Projector Control (MD5 Digest Auth, Shutter AVMT, Lamp/Error Poll)
 *   4. Opt-In --lan Wireless Touch Followspot & Orbital Mix Remote (/pad?token=...) with Scoped Seat Security
 *
 * License: AGPL-3.0-or-later (see LICENSE and NOTICE.md)
 * Usage:
 *   node scripts/osc-artnet-bridge.js [--ws=8080] [--lan] [--token=...] [--osc-in=9000] [--osc-out=9001] [--osc-host=127.0.0.1] [--artnet-host=127.0.0.1]
 *
 * Zero npm packages required — uses built-in Node.js http, net, os, crypto, and dgram!
 */

const http = require('http');
const net = require('net');
const os = require('os');
const crypto = require('crypto');
const dgram = require('dgram');

function getArg(name, fallback) {
  const pref = `--${name}=`;
  const hit = process.argv.find(a => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`) || getArg(name, '') === '1' || getArg(name, '') === 'true';
}

function isLoopbackAddress(addr = '') {
  const s = String(addr || '').trim();
  return s === '127.0.0.1' || s === '::1' || s === '::ffff:127.0.0.1' || s === 'localhost';
}

function getLanIPv4Addresses() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    if (!Array.isArray(list)) continue;
    for (const ni of list) {
      if (ni && (ni.family === 'IPv4' || ni.family === 4) && !ni.internal && ni.address) {
        out.push(ni.address);
      }
    }
  }
  return out;
}

// Minimal RFC 6455 WebSocket Frame Encoder (Binary opcode 0x02 or Text 0x01)
function encodeWsFrame(payloadBuffer, opcode = 0x02) {
  const buf = Buffer.isBuffer(payloadBuffer) ? payloadBuffer : Buffer.from(payloadBuffer);
  const len = buf.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, buf]);
}

// Minimal RFC 6455 Masked/Unmasked Frame Parser
function decodeWsFrames(chunk, stateObj, onFrame) {
  stateObj.buf = Buffer.concat([stateObj.buf, chunk]);
  while (stateObj.buf.length >= 2) {
    const b0 = stateObj.buf[0];
    const b1 = stateObj.buf[1];
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let payloadLen = b1 & 0x7f;
    let offset = 2;

    if (payloadLen === 126) {
      if (stateObj.buf.length < 4) return;
      payloadLen = stateObj.buf.readUInt16BE(2);
      offset = 4;
    } else if (payloadLen === 127) {
      if (stateObj.buf.length < 10) return;
      payloadLen = Number(stateObj.buf.readBigUInt64BE(2));
      offset = 10;
    }

    const maskLen = masked ? 4 : 0;
    if (stateObj.buf.length < offset + maskLen + payloadLen) return;

    const payload = Buffer.from(stateObj.buf.subarray(offset + maskLen, offset + maskLen + payloadLen));
    if (masked) {
      const mask = stateObj.buf.subarray(offset, offset + 4);
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    }
    stateObj.buf = stateObj.buf.subarray(offset + maskLen + payloadLen);
    onFrame(opcode, payload);
  }
}

// ============================================================================
// PJLINK CLASS 1 & CLASS 2 TCP 4352 PROTOCOL CODEC & SOCKET CLIENT
// ============================================================================

function normalizePjLinkCommand(rawCmd = 'AVMT ?') {
  const trimmed = String(rawCmd || '').trim();
  if (/^%[12][A-Z]{4}\b/i.test(trimmed)) return trimmed;
  return `%1${trimmed}`;
}

function buildPjLinkPayload(greetingLine, rawCmd, password = '') {
  const greet = String(greetingLine || '').trim();
  const cmd = normalizePjLinkCommand(rawCmd);
  if (greet.startsWith('PJLINK 1 ')) {
    const rand = greet.slice(9).trim();
    const digest = crypto.createHash('md5').update(`${rand}${String(password || '')}`, 'utf8').digest('hex');
    return `${digest}${cmd}\r`;
  }
  return `${cmd}\r`;
}

function parsePjLinkResponse(rawLine = '') {
  const line = String(rawLine || '').trim();
  const out = {
    ok: false,
    authError: line.includes('PJLINK ERRA'),
    raw: line,
    command: '',
    value: '',
    shutterClosed: null,
    powerState: null,
    lampHours: null,
    lampOn: null,
    errorFlags: null
  };
  if (out.authError) return out;

  const m = line.match(/^%([12])([A-Z]{4})=(.+)$/i);
  if (!m) return out;
  const cmd = m[2].toUpperCase();
  const val = m[3].trim();
  out.command = cmd;
  out.value = val;
  out.ok = !/^ERR[1-4]$/i.test(val);

  if (cmd === 'AVMT' && out.ok) {
    // PJLink AVMT: 31=video+audio mute ON (shutter closed), 11=video mute ON, 30/10=mute OFF (shutter open)
    if (val === '31' || val === '11') out.shutterClosed = true;
    else if (val === '30' || val === '10' || val === '20' || val === '21') out.shutterClosed = false;
  } else if (cmd === 'POWR' && out.ok) {
    const map = { '0': 'standby', '1': 'on', '2': 'cooling', '3': 'warming' };
    out.powerState = map[val] || val;
  } else if (cmd === 'LAMP' && out.ok) {
    const parts = val.split(/\s+/);
    if (parts.length >= 1) out.lampHours = parseInt(parts[0], 10) || 0;
    if (parts.length >= 2) out.lampOn = parts[1] === '1';
  } else if (cmd === 'ERST' && out.ok && val.length >= 6) {
    out.errorFlags = {
      fan: parseInt(val[0], 10) || 0,
      lamp: parseInt(val[1], 10) || 0,
      temp: parseInt(val[2], 10) || 0,
      cover: parseInt(val[3], 10) || 0,
      filter: parseInt(val[4], 10) || 0,
      other: parseInt(val[5], 10) || 0
    };
  }
  return out;
}

function sendPjLinkCommand(opts = {}) {
  const host = String(opts.host || '127.0.0.1').trim();
  const port = Math.max(1, Math.min(65535, parseInt(opts.port || 4352, 10) || 4352));
  const password = String(opts.password || '');
  const rawCmd = String(opts.cmd || opts.command || 'AVMT ?').trim();
  const timeoutMs = Math.max(250, Math.min(8000, parseInt(opts.timeoutMs || 2200, 10) || 2200));

  // Hard Lamp/Laser Safety Guardrail: POWR 0 is strictly forbidden unless explicitly confirmed from Room 1 (WORLD)
  const normUpper = normalizePjLinkCommand(rawCmd).toUpperCase();
  if (/^%[12]POWR\s+0\b/.test(normUpper) && !(opts.confirmPowerOff === true && opts.sourceRoom === 'world')) {
    return Promise.resolve({
      ok: false,
      blockedPowerOff: true,
      error: 'POWR 0 blocked: Projector lamp/laser power-off is restricted to deliberate Hold-to-Confirm in 1 · WORLD',
      rttMs: 0
    });
  }

  return new Promise((resolve) => {
    const t0 = Date.now();
    const sock = new net.Socket();
    let settled = false;
    let stage = 'greeting';
    let rxBuf = '';

    const finish = (res) => {
      if (settled) return;
      settled = true;
      try { sock.destroy(); } catch (_) {}
      resolve({ ...res, host, port, rttMs: Math.max(0, Date.now() - t0) });
    };

    sock.setTimeout(timeoutMs, () => finish({ ok: false, error: `PJLink TCP timeout (${timeoutMs}ms)` }));
    sock.on('error', (err) => finish({ ok: false, error: err ? err.message : 'PJLink socket error' }));
    sock.on('close', () => {
      if (!settled) finish({ ok: false, error: 'PJLink connection closed before reply' });
    });

    sock.on('data', (chunk) => {
      rxBuf += chunk.toString('utf8');
      const crIdx = rxBuf.indexOf('\r');
      const nlIdx = rxBuf.indexOf('\n');
      const cut = crIdx >= 0 ? crIdx : nlIdx;
      if (cut < 0) return;

      const line = rxBuf.slice(0, cut).trim();
      rxBuf = rxBuf.slice(cut + 1).replace(/^\n/, '');

      if (stage === 'greeting') {
        if (!line.startsWith('PJLINK')) {
          finish({ ok: false, error: `Unexpected PJLink greeting: ${line.slice(0, 48)}` });
          return;
        }
        stage = 'reply';
        const outPayload = buildPjLinkPayload(line, rawCmd, password);
        sock.write(outPayload);
        // Check if reply arrived in the same TCP packet
        const cut2 = rxBuf.indexOf('\r') >= 0 ? rxBuf.indexOf('\r') : rxBuf.indexOf('\n');
        if (cut2 >= 0) {
          const repLine = rxBuf.slice(0, cut2).trim();
          finish(parsePjLinkResponse(repLine));
        }
      } else {
        finish(parsePjLinkResponse(line));
      }
    });

    sock.connect(port, host);
  });
}

// ============================================================================
// SELF-CONTAINED WIRELESS /pad TOUCH FOLLOWSPOT & ORBITAL MIX REMOTE HTML
// ============================================================================

function renderWirelessPadHtml(seatLabel = 'Pad Remote') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta name="color-scheme" content="dark" />
  <title>WebMapper Stage Pad — ${seatLabel}</title>
  <style>
    * { box-sizing: border-box; -webkit-user-select: none; user-select: none; }
    html, body { margin: 0; height: 100%; background: #060911; color: #e8f0ff; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; overflow: hidden; overscroll-behavior: none; }
    .shell { display: grid; grid-template-rows: 46px 1fr 64px; height: 100dvh; gap: 8px; padding: 8px; }
    .bar { display: flex; align-items: center; justify-content: space-between; gap: 6px; background: #0d1322; border: 1px solid #1e2b45; border-radius: 10px; padding: 0 10px; }
    .seg { display: flex; gap: 4px; }
    button { min-height: 34px; min-width: 44px; background: #141e33; color: #b7c8e8; border: 1px solid #263759; border-radius: 8px; font: inherit; font-size: 12px; padding: 4px 10px; }
    button.active { background: rgba(255, 203, 125, 0.22); border-color: #ffcb7d; color: #ffcb7d; font-weight: 700; }
    .xy-pad { position: relative; background: radial-gradient(circle at 50% 50%, #10192e 0%, #070b14 78%); border: 1.5px solid #243656; border-radius: 14px; touch-action: none; overflow: hidden; }
    .reticle { position: absolute; width: 46px; height: 46px; margin: -23px 0 0 -23px; border: 2px solid #ffcb7d; border-radius: 50%; pointer-events: none; left: 50%; top: 50%; box-shadow: 0 0 18px rgba(255, 203, 125, 0.45); }
    .faders { display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px; align-items: center; background: #0d1322; border: 1px solid #1e2b45; border-radius: 10px; padding: 6px 12px; }
    label { display: flex; flex-direction: column; gap: 3px; font-size: 10px; color: #8fa6cb; }
    input[type="range"] { width: 100%; min-height: 28px; accent-color: #ffcb7d; }
    .status { font-size: 11px; color: #34e89e; }
  </style>
</head>
<body>
  <div class="shell">
    <header class="bar">
      <div><strong>◈ STAGE PAD</strong> <span id="st" class="status">Connecting…</span></div>
      <div class="seg" role="tablist" aria-label="Target Spot">
        <button type="button" class="active" data-spot="0">Spot 1</button>
        <button type="button" data-spot="1">Spot 2</button>
        <button type="button" data-spot="mix">◎ Mix</button>
      </div>
    </header>
    <main class="xy-pad" id="pad" role="region" aria-label="2D Followspot and Mix XY Pad">
      <div class="reticle" id="ret"></div>
    </main>
    <footer class="faders">
      <label for="rng-gain">BEAM GAIN <input id="rng-gain" type="range" min="0" max="3" step="0.02" value="1.6" /></label>
      <label for="rng-iris">IRIS SIZE <input id="rng-iris" type="range" min="0.02" max="0.8" step="0.005" value="0.22" /></label>
      <button type="button" id="btn-beam">BEAM</button>
    </footer>
  </div>
  <script>
    (() => {
      const qs = new URLSearchParams(location.search);
      const token = qs.get('token') || '';
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(proto + '//' + location.host + '/pad-ws?token=' + encodeURIComponent(token));
      const st = document.getElementById('st');
      const pad = document.getElementById('pad');
      const ret = document.getElementById('ret');
      let target = '0';
      let beamOn = false;
      ws.onopen = () => { st.textContent = 'LIVE'; };
      ws.onclose = () => { st.textContent = 'OFFLINE'; st.style.color = '#ff6b8b'; };
      function send(msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
      document.querySelectorAll('[data-spot]').forEach(btn => {
        btn.onclick = () => {
          document.querySelectorAll('[data-spot]').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          target = btn.dataset.spot;
        };
      });
      const sendXY = (e) => {
        const r = pad.getBoundingClientRect();
        const u = Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width)));
        const v = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / Math.max(1, r.height)));
        ret.style.left = (u * 100) + '%';
        ret.style.top = ((1 - v) * 100) + '%';
        if (target === 'mix') send({ type: 'pad_event', action: 'mix_xy', x: u * 2 - 1, y: (1 - v) * 2 - 1 });
        else send({ type: 'pad_event', action: 'spot_xy', spotIndex: Number(target) || 0, x: u, y: v });
      };
      pad.addEventListener('pointerdown', e => { pad.setPointerCapture(e.pointerId); sendXY(e); });
      pad.addEventListener('pointermove', e => { if (pad.hasPointerCapture(e.pointerId)) sendXY(e); });
      document.getElementById('rng-gain').oninput = e => send({ type: 'pad_event', action: 'spot_gain', spotIndex: Number(target) || 0, value: Number(e.target.value) });
      document.getElementById('rng-iris').oninput = e => send({ type: 'pad_event', action: 'spot_iris', spotIndex: Number(target) || 0, value: Number(e.target.value) });
      const beamBtn = document.getElementById('btn-beam');
      beamBtn.onclick = () => {
        beamOn = !beamOn;
        beamBtn.classList.toggle('active', beamOn);
        send({ type: 'pad_event', action: 'spot_beam', spotIndex: Number(target) || 0, on: beamOn });
      };
    })();
  </script>
</body>
</html>`;
}

// ============================================================================
// CREATE BRIDGE SERVER INSTANCE (USED BY CLI & AUTOMATED TEST SUITE)
// ============================================================================

function createBridgeServer(config = {}) {
  const wsPort = parseInt(config.wsPort ?? getArg('ws', '8080'), 10);
  const lanEnabled = config.lanEnabled !== undefined ? !!config.lanEnabled : (config.lan !== undefined ? !!config.lan : hasFlag('lan'));
  const bindHost = config.bindHost || (lanEnabled ? '0.0.0.0' : '127.0.0.1');
  const pairToken = String(config.token || getArg('token', '') || crypto.randomBytes(12).toString('hex'));
  const oscInPort = parseInt(config.oscInPort ?? getArg('osc-in', '9000'), 10);
  const oscOutPort = parseInt(config.oscOutPort ?? getArg('osc-out', '9001'), 10);
  const oscOutHost = config.oscOutHost || getArg('osc-host', '127.0.0.1');
  const artNetPort = parseInt(config.artNetPort ?? getArg('artnet-port', '6454'), 10);
  const artNetHost = config.artNetHost || getArg('artnet-host', '127.0.0.1');

  const studioClients = new Set();
  const allClients = new Map(); // socket -> { role: 'studio' | 'pad' }
  const udpOsc = dgram.createSocket('udp4');
  const udpArtNet = dgram.createSocket('udp4');
  udpOsc.unref();
  udpArtNet.unref();

  function broadcastJsonToStudios(obj) {
    const frame = encodeWsFrame(Buffer.from(JSON.stringify(obj), 'utf8'), 0x01);
    for (const sock of studioClients) {
      try { sock.write(frame); } catch (_) {}
    }
  }

  const server = http.createServer((req, res) => {
    const remoteIp = req.socket ? req.socket.remoteAddress : '';
    const isLocal = isLoopbackAddress(remoteIp);
    let parsedUrl;
    try {
      parsedUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    } catch (_) {
      parsedUrl = new URL('http://127.0.0.1/');
    }

    if (parsedUrl.pathname === '/pad') {
      const tok = parsedUrl.searchParams.get('token') || '';
      if (tok !== pairToken || (!isLocal && !lanEnabled)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('403 Forbidden — Scan QR or copy exact Pairing Token URL from WebMapper Studio');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderWirelessPadHtml());
      return;
    }

    if (!isLocal) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Studio metadata restricted to loopback' }));
      return;
    }

    const lanIps = getLanIPv4Addresses();
    const actualPort = server.address() ? server.address().port : wsPort;
    const padHost = lanIps[0] || '127.0.0.1';
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({
      bridge: 'WebMapper Hardware Relay v2.1 (OSC + Art-Net + PJLink + Stage Pad)',
      wsPort: actualPort,
      lanEnabled,
      lanIps,
      padUrl: `http://${padHost}:${actualPort}/pad?token=${pairToken}`,
      oscInPort,
      oscOut: `${oscOutHost}:${oscOutPort}`,
      artNetOut: `${artNetHost}:${artNetPort}`,
      studioClients: studioClients.size,
      totalClients: allClients.size
    }));
  });

  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }

    const remoteIp = socket.remoteAddress || '';
    const isLocal = isLoopbackAddress(remoteIp);
    let parsedUrl;
    try {
      parsedUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    } catch (_) {
      parsedUrl = new URL('http://127.0.0.1/');
    }

    const reqToken = parsedUrl.searchParams.get('token') || '';
    const isPadEndpoint = parsedUrl.pathname === '/pad-ws';

    // Enforce Loopback-Only Studio Control & Token-Scoped LAN Pad Security
    let role = 'pad';
    if (isLocal && !isPadEndpoint) {
      role = 'studio';
    } else {
      const tokenOk = (reqToken === pairToken) && (isLocal || lanEnabled);
      if (!tokenOk) {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      role = 'pad';
    }

    const accept = crypto
      .createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );

    allClients.set(socket, { role });
    if (role === 'studio') {
      studioClients.add(socket);
      const actualPort = server.address() ? server.address().port : wsPort;
      const lanIps = getLanIPv4Addresses();
      const padHost = lanIps[0] || '127.0.0.1';
      const hello = JSON.stringify({
        type: 'bridge_hello',
        lanEnabled,
        lanIps,
        padUrl: `http://${padHost}:${actualPort}/pad?token=${pairToken}`
      });
      try { socket.write(encodeWsFrame(Buffer.from(hello, 'utf8'), 0x01)); } catch (_) {}
    } else {
      broadcastJsonToStudios({ type: 'pad_status', connectedPads: Array.from(allClients.values()).filter(c => c.role === 'pad').length });
    }

    const parserState = { buf: Buffer.alloc(0) };

    socket.on('data', (chunk) => {
      decodeWsFrames(chunk, parserState, (opcode, payload) => {
        if (opcode === 0x08) {
          allClients.delete(socket);
          studioClients.delete(socket);
          socket.end();
          return;
        }
        if (opcode === 0x09) {
          socket.write(encodeWsFrame(payload, 0x0a));
          return;
        }

        // PAD ROLE: Strictly scoped to pad_event (spot.* / mix.*), NEVER Art-Net, UDP OSC injection, or PJLink!
        if (role === 'pad') {
          if (opcode === 0x01 && payload.length <= 1024) {
            try {
              const msg = JSON.parse(payload.toString('utf8'));
              if (msg && msg.type === 'pad_event' && ['spot_xy', 'spot_gain', 'spot_iris', 'spot_beam', 'mix_xy'].includes(msg.action)) {
                broadcastJsonToStudios(msg);
              }
            } catch (_) {}
          }
          return;
        }

        // STUDIO ROLE (Loopback Only): Full Art-Net, OSC & PJLink Hardware Relay
        if (opcode === 0x02 && payload.length >= 8) {
          if (payload.subarray(0, 8).toString('ascii') === 'Art-Net\0') {
            udpArtNet.send(payload, artNetPort, artNetHost);
          } else {
            udpOsc.send(payload, oscOutPort, oscOutHost);
          }
        } else if (opcode === 0x01) {
          try {
            const msg = JSON.parse(payload.toString('utf8'));
            if (!msg || typeof msg !== 'object') return;
            if (msg.type === 'artnet' && Array.isArray(msg.packet)) {
              const pkt = Buffer.from(msg.packet);
              udpArtNet.send(pkt, msg.port || artNetPort, msg.host || artNetHost);
            } else if (msg.type === 'pjlink') {
              sendPjLinkCommand({
                host: msg.host,
                port: msg.port || 4352,
                password: msg.password || '',
                cmd: msg.cmd || 'AVMT ?',
                confirmPowerOff: !!msg.confirmPowerOff,
                sourceRoom: msg.sourceRoom || '',
                timeoutMs: msg.timeoutMs || 2200
              }).then((result) => {
                const reply = JSON.stringify({
                  type: 'pjlink_reply',
                  reqId: msg.reqId || null,
                  screenIndex: msg.screenIndex ?? null,
                  result
                });
                try { socket.write(encodeWsFrame(Buffer.from(reply, 'utf8'), 0x01)); } catch (_) {}
              });
            }
          } catch (_) {}
        }
      });
    });

    const cleanup = () => {
      const wasPad = allClients.get(socket)?.role === 'pad';
      allClients.delete(socket);
      studioClients.delete(socket);
      if (wasPad) {
        broadcastJsonToStudios({ type: 'pad_status', connectedPads: Array.from(allClients.values()).filter(c => c.role === 'pad').length });
      }
    };
    socket.on('close', cleanup);
    socket.on('error', cleanup);
  });

  udpOsc.on('message', (msg) => {
    const frame = encodeWsFrame(msg, 0x02);
    for (const sock of studioClients) {
      try { sock.write(frame); } catch (_) {}
    }
  });

  return {
    server,
    httpServer: server,
    udpOsc,
    udpArtNet,
    pairToken,
    lanEnabled,
    bindHost,
    wsPort,
    oscInPort,
    close() {
      for (const sock of allClients.keys()) {
        try { sock.destroy(); } catch (_) {}
      }
      try { udpOsc.close(); } catch (_) {}
      try { udpArtNet.close(); } catch (_) {}
      return new Promise(res => server.close(() => res()));
    }
  };
}

if (require.main === module) {
  const bridge = createBridgeServer();
  bridge.udpOsc.ref();
  bridge.udpArtNet.ref();
  bridge.udpArtNet.bind(() => {
    try { bridge.udpArtNet.setBroadcast(true); } catch (_) {}
  });
  bridge.udpOsc.bind(bridge.oscInPort, () => {
    bridge.server.listen(bridge.wsPort, bridge.bindHost, () => {
      const lanIps = getLanIPv4Addresses();
      const padHost = lanIps[0] || '127.0.0.1';
      console.log(
        `[WebMapper Bridge v2.1] Ready!\n` +
        `  • Studio WebSocket : ws://127.0.0.1:${bridge.wsPort} (Art-Net + OSC + PJLink TCP 4352)\n` +
        `  • Stage Pad Remote : http://${padHost}:${bridge.wsPort}/pad?token=${bridge.pairToken} ${bridge.lanEnabled ? '(LAN ENABLED)' : '(Loopback — pass --lan for Wi-Fi phones/iPads)'}\n` +
        `  • UDP OSC In       : 0.0.0.0:${bridge.oscInPort}\n` +
        `  • PJLink TCP 4352  : Ready (AVMT Shutter, LAMP/ERST Poll, MD5 Digest Auth)`
      );
    });
  });
}

module.exports = {
  encodeWsFrame,
  decodeWsFrames,
  buildPjLinkPayload,
  parsePjLinkResponse,
  sendPjLinkCommand,
  createBridgeServer
};
