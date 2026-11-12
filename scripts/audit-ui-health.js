#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
/**
 * WebMapper — Zero-Token Static + Headless Chrome UI & Runtime Health Crawler
 * Generates `AUDIT_REPORT.md` so AI coding agents immediately see any broken wiring,
 * layout clipping/overlaps, or runtime edge cases without reading 48,000 lines of code.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src');
const outReport = path.join(root, 'AUDIT_REPORT.md');
const CHROME_BIN = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WEBMAPPER_URL = 'file://' + path.join(root, 'Chaos-CathodeRay.html');

// ============================================================================
// 1. STATIC DOM <-> JS WIRING AUDIT
// ============================================================================
const bodyHtml = fs.readFileSync(path.join(srcDir, 'body.html'), 'utf8');
const bodyLines = bodyHtml.split('\n');
const jsFiles = fs.readdirSync(srcDir).filter(f => /^\d+.*\.js$/.test(f)).sort();
const allJsCode = jsFiles.map(f => ({ file: f, code: fs.readFileSync(path.join(srcDir, f), 'utf8') }));
const combinedJs = allJsCode.map(j => j.code).join('\n');

const interactiveControls = [];
for (let i = 0; i < bodyLines.length; i++) {
  const line = bodyLines[i];
  for (const m of line.matchAll(/<(button|input|select|textarea)\b([^>]*)>/gi)) {
    const tag = m[1].toLowerCase();
    const attrs = m[2];
    const idM = attrs.match(/\bid="([^"]+)"/);
    if (idM) {
      interactiveControls.push({ tag, id: idM[1], line: i + 1 });
    }
  }
}

const unreferencedControls = [];
for (const ctrl of interactiveControls) {
  // Check if ID appears anywhere in JS (by id string or prefix pattern)
  if (!combinedJs.includes(ctrl.id)) {
    unreferencedControls.push(ctrl);
  }
}

const allHtmlIds = new Set([...bodyHtml.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
for (const m of combinedJs.matchAll(/\bid="([^"$]+)"/g)) {
  allHtmlIds.add(m[1]);
}

const missingDomRefs = [];
for (const { file, code } of allJsCode) {
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      if (!allHtmlIds.has(m[1])) {
        missingDomRefs.push({ file, line: i + 1, id: m[1] });
      }
    }
  }
}

// ============================================================================
// 2. HEADLESS CHROME CDP LIVE MULTI-ROOM CRAWLER
// ============================================================================
function encodeClientWsFrame(str) {
  const payload = Buffer.from(str, 'utf8');
  const mask = crypto.randomBytes(4);
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(6);
    header[0] = 0x81;
    header[1] = 0x80 | len;
    mask.copy(header, 2);
  } else if (len < 65536) {
    header = Buffer.alloc(8);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
    mask.copy(header, 4);
  } else {
    header = Buffer.alloc(14);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
    mask.copy(header, 10);
  }
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i & 3];
  return Buffer.concat([header, masked]);
}

function connectCdpWs(wsUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(wsUrl);
    const sock = net.connect(Number(u.port), u.hostname, () => {
      const key = crypto.randomBytes(16).toString('base64');
      sock.write(
        `GET ${u.pathname}${u.search} HTTP/1.1\r\n` +
        `Host: ${u.host}\r\n` +
        `Upgrade: websocket\r\n` +
        `Connection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${key}\r\n` +
        `Sec-WebSocket-Version: 13\r\n\r\n`
      );
    });
    let upgraded = false;
    let buf = Buffer.alloc(0);
    let nextId = 1;
    const pending = new Map();
    const listeners = new Map();

    function handleMessage(jsonStr) {
      let msg;
      try { msg = JSON.parse(jsonStr); } catch (_) { return; }
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(JSON.stringify(msg.error)));
        else res(msg.result);
      } else if (msg.method) {
        const arr = listeners.get(msg.method);
        if (arr) for (const fn of arr) fn(msg.params);
      }
    }

    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!upgraded) {
        const idx = buf.indexOf('\r\n\r\n');
        if (idx === -1) return;
        upgraded = true;
        buf = buf.subarray(idx + 4);
        resolve({
          send(method, params = {}) {
            const id = nextId++;
            return new Promise((res, rej) => {
              pending.set(id, { res, rej });
              sock.write(encodeClientWsFrame(JSON.stringify({ id, method, params })));
            });
          },
          on(method, fn) {
            if (!listeners.has(method)) listeners.set(method, []);
            listeners.get(method).push(fn);
          },
          close() { sock.destroy(); }
        });
      }
      while (buf.length >= 2) {
        const b0 = buf[0];
        const b1 = buf[1];
        const opcode = b0 & 0x0f;
        let len = b1 & 0x7f;
        let offset = 2;
        if (len === 126) {
          if (buf.length < 4) return;
          len = buf.readUInt16BE(2);
          offset = 4;
        } else if (len === 127) {
          if (buf.length < 10) return;
          len = Number(buf.readBigUInt64BE(2));
          offset = 10;
        }
        const masked = (b1 & 0x80) !== 0;
        if (masked) offset += 4;
        if (buf.length < offset + len) return;
        const payload = buf.subarray(offset, offset + len);
        buf = buf.subarray(offset + len);
        if (opcode === 0x01) handleMessage(payload.toString('utf8'));
      }
    });
    sock.on('error', reject);
  });
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

(async () => {
  const userDataDir = fs.mkdtempSync('/tmp/wm-audit-');
  const debugPort = 9355;
  const chrome = spawn(CHROME_BIN, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=1440,900',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--allow-file-access-from-files',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ], { stdio: 'ignore' });

  const cleanup = () => {
    try { chrome.kill('SIGKILL'); } catch (_) {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
  };
  process.on('exit', cleanup);

  let targets = null;
  for (let i = 0; i < 40; i++) {
    try {
      targets = await fetchJson(`http://127.0.0.1:${debugPort}/json/list`);
      if (Array.isArray(targets) && targets.length > 0) break;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 150));
  }

  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  const cdp = await connectCdpWs(pageTarget.webSocketDebuggerUrl);

  const consoleErrors = [];
  const pageExceptions = [];
  cdp.on('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error') {
      const txt = (p.args || []).map(a => a.value || a.description || '').join(' ');
      consoleErrors.push(txt);
    }
  });
  cdp.on('Runtime.exceptionThrown', (p) => {
    pageExceptions.push(p.exceptionDetails ? (p.exceptionDetails.text + ' ' + (p.exceptionDetails.exception?.description || '')) : 'exception');
  });

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false
  });

  const evalJs = async (expression) => {
    const res = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) {
      throw new Error('Eval exception: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text));
    }
    return res.result ? res.result.value : undefined;
  };

  await cdp.send('Page.navigate', { url: WEBMAPPER_URL });
  for (let i = 0; i < 40; i++) {
    const ready = await evalJs(`Boolean(window.ChaosCathodeRayAPI && document.readyState === 'complete')`);
    if (ready) break;
    await new Promise(r => setTimeout(r, 150));
  }
  await new Promise(r => setTimeout(r, 350));
  // First visit opens the Start screen (modal): scan the studio behind it, and the screen itself.
  await evalJs(`document.getElementById('start-dialog')?.close()`);

  // Helper injected into page to scan layout geometry of current view
  const scanViewGeometry = async (viewLabel) => {
    return evalJs(`(() => {
      const issues = [];
      const topbar = document.getElementById('topbar');
      if (topbar && topbar.scrollWidth > topbar.clientWidth + 2) {
        issues.push({ kind: 'overflow', target: '#topbar', detail: 'scrollWidth ' + topbar.scrollWidth + ' > clientWidth ' + topbar.clientWidth });
      }
      const docks = ['world-left-dock', 'world-right-dock', 'live-right-dock', 'left-dock', 'right-dock'];
      for (const dId of docks) {
        const d = document.getElementById(dId);
        if (!d || d.classList.contains('inactive') || d.hidden) continue;
        if (d.scrollWidth > d.clientWidth + 4) {
          issues.push({ kind: 'dock-horiz-overflow', target: '#' + dId, detail: 'scrollWidth ' + d.scrollWidth + ' > clientWidth ' + d.clientWidth });
        }
      }
      // Check visible buttons/selects/inputs for collapsed rects or clipped labels
      const ctrls = Array.from(document.querySelectorAll('button, select, input:not([type="file"]):not([type="hidden"]):not([type="checkbox"])'));
      for (const el of ctrls) {
        if (el.closest('.inactive, [hidden], dialog:not([open])')) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.width < 14 || r.height < 12) {
          issues.push({ kind: 'tiny-control', target: (el.id ? '#' + el.id : el.tagName + '.' + el.className), detail: Math.round(r.width) + 'x' + Math.round(r.height) + 'px' });
        }
        if (el.tagName === 'BUTTON' && el.scrollWidth > el.clientWidth + 6 && cs.textOverflow !== 'ellipsis') {
          issues.push({ kind: 'button-text-clip', target: (el.id ? '#' + el.id : el.textContent.trim().slice(0, 24)), detail: 'scrollWidth ' + el.scrollWidth + ' > clientWidth ' + el.clientWidth + ' ("' + el.textContent.trim().slice(0, 28) + '")' });
        }
      }
      const gl2 = document.getElementById('gl-engine')?.getContext('webgl2');
      const glErr = gl2 ? gl2.getError() : -1;
      if (glErr !== 0) {
        issues.push({ kind: 'webgl-error', target: '#gl-engine', detail: 'gl.getError() = ' + glErr });
      }
      return { view: ${JSON.stringify(viewLabel)}, issueCount: issues.length, issues };
    })()`);
  };

  const viewReports = [];

  // Crawl 1: Room 2 · MAP across all 5 Inspector Tabs + Timeline Drawer
  for (const tabId of ['tab-insp-surface', 'tab-insp-mask', 'tab-insp-spot', 'tab-insp-output', 'tab-insp-mod']) {
    await evalJs(`(() => {
      window.ChaosCathodeRayAPI.setRoom('map');
      document.getElementById(${JSON.stringify(tabId)})?.click();
    })()`);
    await new Promise(r => setTimeout(r, 80));
    viewReports.push(await scanViewGeometry(`2 · MAP (${tabId.replace('tab-insp-', '')})`));
  }

  // Open Timeline Drawer in 2 · MAP
  await evalJs(`document.getElementById('btn-toggle-timeline')?.click()`);
  await new Promise(r => setTimeout(r, 80));
  viewReports.push(await scanViewGeometry(`2 · MAP + Timeline Drawer`));
  await evalJs(`document.getElementById('btn-tl-close')?.click()`);

  // Crawl 2: Room 1 · BUILD across Split, 2D Plan, 3D Orbit, Stage
  for (const mode of ['split', 'plan2d', 'world3d', 'warp']) {
    await evalJs(`(() => {
      window.ChaosCathodeRayAPI.setRoom('build');
      window.ChaosCathodeRayAPI.setBuildViewMode(${JSON.stringify(mode)});
    })()`);
    await new Promise(r => setTimeout(r, 90));
    viewReports.push(await scanViewGeometry(`1 · BUILD (${mode})`));
  }

  // Test 3D Orbit Gizmo & Pointer Drag in 1 · BUILD
  await evalJs(`(() => {
    window.ChaosCathodeRayAPI.setRoom('build');
    document.querySelector('#venue-hud [data-cam="orbit"]')?.click();
    const cvs = document.getElementById('rig-canvas');
    const r = cvs.getBoundingClientRect();
    cvs.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + 80, clientY: r.top + 80, button: 0, pointerId: 1, bubbles: true }));
    cvs.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + 120, clientY: r.top + 95, button: 0, buttons: 1, pointerId: 1, bubbles: true }));
    cvs.dispatchEvent(new PointerEvent('pointerup', { clientX: r.left + 120, clientY: r.top + 95, button: 0, pointerId: 1, bubbles: true }));
  })()`);
  viewReports.push(await scanViewGeometry(`1 · BUILD (3D Orbit after drag)`));

  // Crawl 3: Room 3 · LIVE across Split, Solo Mix, Constellation
  await evalJs(`window.ChaosCathodeRayAPI.setRoom('live')`);
  await new Promise(r => setTimeout(r, 120));
  viewReports.push(await scanViewGeometry(`3 · LIVE (Split Radar + Stage)`));

  await evalJs(`window.ChaosCathodeRayAPI.setLiveMixSolo(true)`);
  await new Promise(r => setTimeout(r, 80));
  viewReports.push(await scanViewGeometry(`3 · LIVE (Solo Mix)`));
  await evalJs(`window.ChaosCathodeRayAPI.setLiveMixSolo(false)`);

  await evalJs(`document.getElementById('btn-mixtab-constellation')?.click()`);
  await new Promise(r => setTimeout(r, 80));
  viewReports.push(await scanViewGeometry(`3 · LIVE (Constellation Pad)`));
  await evalJs(`document.getElementById('btn-mixtab-radar')?.click()`);

  // Check for NaN anywhere in serialized Show JSON
  const nanPaths = await evalJs(`(() => {
    const show = window.ChaosCathodeRayAPI.exportShow(false);
    const bad = [];
    const walk = (obj, p) => {
      if (typeof obj === 'number' && !Number.isFinite(obj)) bad.push(p);
      else if (Array.isArray(obj)) obj.forEach((v, i) => walk(v, p + '[' + i + ']'));
      else if (obj && typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) walk(v, p ? p + '.' + k : k);
      }
    };
    walk(show, '');
    return bad;
  })()`);

  cdp.close();
  cleanup();

  // Build Markdown Report
  const md = [];
  md.push('# Chaos CathodeRay — Automated UI, Wiring & Runtime Health Report');
  md.push('');
  md.push(`> Generated by \`node scripts/audit-ui-health.js\` (\`npm run audit\`).`);
  md.push('');
  md.push('## 1. Summary Metrics');
  md.push(`- **Interactive DOM controls audited in \`src/body.html\`**: ${interactiveControls.length}`);
  md.push(`- **Unreferenced DOM controls**: ${unreferencedControls.length}`);
  md.push(`- **Missing \`getElementById\` targets**: ${missingDomRefs.length}`);
  md.push(`- **Runtime \`console.error\` count across 12 room/mode crawls**: ${consoleErrors.length}`);
  md.push(`- **Uncaught page exceptions**: ${pageExceptions.length}`);
  md.push(`- **Non-finite (\`NaN\`/\`Infinity\`) state paths**: ${nanPaths.length}`);
  md.push('');

  md.push('## 2. Static DOM <-> JS Wiring Check');
  if (unreferencedControls.length === 0 && missingDomRefs.length === 0) {
    md.push('- ✅ All interactive DOM IDs in `src/body.html` and `getElementById()` calls in `src/*.js` are 100% matched.');
  } else {
    for (const u of unreferencedControls) {
      md.push(`- ⚠️ Unreferenced control \`#${u.id}\` (\`<${u.tag}>\`) at \`src/body.html:${u.line}\``);
    }
    for (const m of missingDomRefs) {
      md.push(`- ❌ Missing DOM ID \`#${m.id}\` referenced at \`src/${m.file}:${m.line}\``);
    }
  }
  md.push('');

  md.push('## 3. Live Headless Chrome Multi-Room Layout & WebGL2 Crawl');
  for (const vr of viewReports) {
    if (vr.issueCount === 0) {
      md.push(`- ✅ **${vr.view}**: 0 layout overflows, 0 clipped buttons, 0 WebGL errors`);
    } else {
      md.push(`- ⚠️ **${vr.view}** (${vr.issueCount} findings):`);
      for (const iss of vr.issues) {
        md.push(`  - \`[${iss.kind}]\` \`${iss.target}\`: ${iss.detail}`);
      }
    }
  }
  md.push('');

  if (consoleErrors.length > 0 || pageExceptions.length > 0 || nanPaths.length > 0) {
    md.push('## 4. Runtime Exceptions / Console Errors / NaN State');
    for (const e of consoleErrors) md.push(`- ❌ \`console.error\`: ${e}`);
    for (const p of pageExceptions) md.push(`- ❌ \`exception\`: ${p}`);
    for (const n of nanPaths) md.push(`- ❌ \`NaN/Infinity\`: ${n}`);
    md.push('');
  }

  fs.writeFileSync(outReport, md.join('\n'), 'utf8');
  console.log(`Generated AUDIT_REPORT.md (${md.length} lines)`);
})();
