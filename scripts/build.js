#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src');

const css = fs.readFileSync(path.join(srcDir, 'styles.css'), 'utf8');
const body = fs.readFileSync(path.join(srcDir, 'body.html'), 'utf8');

const jsFiles = fs.readdirSync(srcDir)
  .filter(f => /^\d+.*\.js$/.test(f))
  .sort();

const combinedJs = `(() => {\n'use strict';\n\n` +
  jsFiles.map(f => `// === MODULE: ${f} ===\n` + fs.readFileSync(path.join(srcDir, f), 'utf8')).join('\n\n') +
  `\n})();\n`;

// Syntax-check combined JS before writing Chaos-CathodeRay.html
const tmpJs = path.join(root, 'scripts', '.tmp-syntax-check.js');
fs.writeFileSync(tmpJs, combinedJs, 'utf8');
try {
  execFileSync(process.execPath, ['--check', tmpJs], { stdio: 'inherit' });
} finally {
  if (fs.existsSync(tmpJs)) fs.unlinkSync(tmpJs);
}

const html = `<!DOCTYPE html>
<!--
  Chaos CathodeRay — projection mapping, video-as-light & show control
  Copyright © 2026 Jonathan O'Hear
  SPDX-License-Identifier: AGPL-3.0-or-later (with additional terms & permissions: NOTICE.md)
  Source: https://github.com/johear/Chaos-CathodeRay · "Chaos CathodeRay" is a trademark (TRADEMARK.md)
-->
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <title>Chaos CathodeRay — Projection Mapping &amp; Show Control</title>
  <style>
${css}
  </style>
</head>
<body>
${body}
  <script>
${combinedJs}
  </script>
</body>
</html>
`;

const outPath = path.join(root, 'Chaos-CathodeRay.html');
fs.writeFileSync(outPath, html, 'utf8');
console.log(`Built portable Chaos-CathodeRay.html (${html.split('\n').length} lines, ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB) from ${jsFiles.length} JS modules.`);
