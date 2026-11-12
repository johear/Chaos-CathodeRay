#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
/**
 * WebMapper — Fast Symbol & Section Index Generator (`SYMBOL_INDEX.md`)
 * Maps every module, section header, top-level function (with start-end line range),
 * state property, and major DOM landmark so AI coding agents can read 50-line slices
 * instead of scanning 48,000 lines of source code.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src');
const outFile = path.join(root, 'SYMBOL_INDEX.md');

const jsFiles = fs.readdirSync(srcDir)
  .filter(f => /^\d+.*\.js$/.test(f))
  .sort();

const linesOut = [];
linesOut.push('# Chaos CathodeRay — Source Symbol & Line-Number Index');
linesOut.push('');
linesOut.push('> **Token-Saving Rule for AI Agents**: Do NOT read entire `src/` files from line 1 to EOF.');
linesOut.push('> Look up the function, section, or DOM container below and read only its exact `[startLine, endLine]` slice.');
linesOut.push('> Regenerate this index anytime after edits via `node scripts/generate-symbol-index.js` (`npm run index`).');
linesOut.push('');

// 1. Module Summary Table
linesOut.push('## 1. Modular Source Files (`src/`)');
linesOut.push('');
linesOut.push('| File | Lines | Size | Primary Responsibility |');
linesOut.push('| :--- | ---: | ---: | :--- |');

const allFiles = ['styles.css', 'body.html', ...jsFiles];
for (const f of allFiles) {
  const full = path.join(srcDir, f);
  const content = fs.readFileSync(full, 'utf8');
  const lc = content.split('\n').length;
  const kb = (Buffer.byteLength(content, 'utf8') / 1024).toFixed(1) + ' KB';
  let desc = '';
  if (f === 'styles.css') desc = 'All studio CSS, room visibility (`[data-room="build"|"map"|"live"]`), Solo Mix/Rig, dialogs';
  else if (f === 'body.html') desc = 'All DOM markup: `#topbar`, `#world-left-dock`, `#world-right-dock`, `#live-right-dock`, `#left-dock`, `#right-dock`, 8 `<dialog>`s';
  else {
    const firstComment = content.split('\n').slice(0, 6).filter(l => l.startsWith('//')).map(l => l.replace(/^\/\/\s*=*\s*/, '').trim()).filter(Boolean)[0] || '';
    desc = firstComment.replace(/^[\d\w-]+\.js\s*[—-]\s*/, '');
  }
  linesOut.push(`| \`src/${f}\` | ${lc} | ${kb} | ${desc} |`);
}
linesOut.push('');

// 2. Major DOM Containers in src/body.html
linesOut.push('## 2. Major DOM Landmarks in `src/body.html`');
linesOut.push('');
const bodyLines = fs.readFileSync(path.join(srcDir, 'body.html'), 'utf8').split('\n');
for (let i = 0; i < bodyLines.length; i++) {
  const l = bodyLines[i];
  const commentM = l.match(/<!--\s*(?:===+\s*)?([A-Z0-9].*?)(?:\s*===+)?\s*-->/);
  if (commentM && commentM[1].length > 8) {
    linesOut.push(`- **L${i + 1}**: \`<!-- ${commentM[1].trim()} -->\``);
  }
  const tagM = l.match(/<(header|aside|main|section|footer|dialog)\b[^>]*\bid="([^"]+)"/);
  if (tagM) {
    linesOut.push(`  - \`#${tagM[2]}\` (\`<${tagM[1]}>\`) — \`src/body.html:${i + 1}\``);
  }
}
linesOut.push('');

// 3. Top-Level State Keys in src/03-state-media.js
linesOut.push('## 3. Core `state` Keys in `src/03-state-media.js`');
linesOut.push('');
const stateFile = fs.readFileSync(path.join(srcDir, '03-state-media.js'), 'utf8').split('\n');
let inStateObj = false;
let braceDepth = 0;
const stateProps = [];
for (let i = 0; i < stateFile.length; i++) {
  const line = stateFile[i];
  if (line.startsWith('const state = {')) {
    inStateObj = true;
    braceDepth = 1;
    linesOut.push(`\`const state = { ... }\` starts at \`src/03-state-media.js:${i + 1}\`:`);
    continue;
  }
  if (inStateObj) {
    if (braceDepth === 1) {
      const m = line.match(/^\s{2}([a-zA-Z0-9_]+)\s*:/);
      if (m) stateProps.push(`\`state.${m[1]}\` (L${i + 1})`);
    }
    for (const ch of line) {
      if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth--;
    }
    if (braceDepth <= 0) {
      inStateObj = false;
      break;
    }
  }
}
linesOut.push(stateProps.join(', '));
linesOut.push('');

// 4. Per-Module Sections & Functions with Exact Line Ranges
linesOut.push('## 4. Per-Module Function & Section Index');
linesOut.push('');

for (const jf of jsFiles) {
  if (jf === '03d-demo-videos.js') continue; // skip base64 video blob
  const full = path.join(srcDir, jf);
  const srcLines = fs.readFileSync(full, 'utf8').split('\n');

  linesOut.push(`### \`src/${jf}\` (${srcLines.length} lines)`);

  const entries = [];
  for (let i = 0; i < srcLines.length; i++) {
    const line = srcLines[i];
    // Section banner check
    if (/^\/\/\s*(?:\d+\.|[A-Z0-9][A-Z0-9\s&/(),.:+-]{10,})$/.test(line.trim()) && !line.includes('====')) {
      entries.push({ type: 'section', line: i + 1, title: line.replace(/^\/\/\s*/, '').trim() });
    }
    // Top-level function declaration or const arrow/obj at column 0
    const fnMatch = line.match(/^(?:async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
    if (fnMatch) {
      // Find matching closing brace at column 0
      let endLine = i + 1;
      for (let j = i + 1; j < srcLines.length; j++) {
        if (/^\}/.test(srcLines[j])) {
          endLine = j + 1;
          break;
        }
        if (/^(?:async\s+)?function\s+[a-zA-Z0-9_]+/.test(srcLines[j])) {
          endLine = j;
          break;
        }
      }
      entries.push({
        type: 'fn',
        name: fnMatch[1],
        params: fnMatch[2].trim(),
        start: i + 1,
        end: endLine
      });
    } else {
      const constMatch = line.match(/^const\s+([A-Z][A-Z0-9_]{3,}|WEBMAPPER_[A-Z0-9_]+)\s*=/);
      if (constMatch) {
        entries.push({ type: 'const', name: constMatch[1], line: i + 1 });
      }
    }
  }

  for (const e of entries) {
    if (e.type === 'section') {
      linesOut.push(`- **Section L${e.line}**: *${e.title}*`);
    } else if (e.type === 'const') {
      linesOut.push(`  - \`${e.name}\` — \`L${e.line}\``);
    } else if (e.type === 'fn') {
      linesOut.push(`  - \`${e.name}(${e.params})\` — \`L${e.start}-${e.end}\``);
    }
  }
  linesOut.push('');
}

// 5. CSS Major Sections in src/styles.css
linesOut.push('### `src/styles.css` Sections');
const cssLines = fs.readFileSync(path.join(srcDir, 'styles.css'), 'utf8').split('\n');
for (let i = 0; i < cssLines.length; i++) {
  const m = cssLines[i].match(/\/\*\s*([A-Z0-9][^*]{8,})\*\//);
  if (m && !m[1].includes('===')) {
    linesOut.push(`- **L${i + 1}**: \`${m[1].trim()}\``);
  } else if (cssLines[i].includes('==') && cssLines[i + 1]) {
    const nextLine = cssLines[i + 1].replace(/\*/g, '').trim();
    if (nextLine.length > 5 && !nextLine.includes('===')) {
      linesOut.push(`- **L${i + 2}**: \`${nextLine}\``);
    }
  }
}
linesOut.push('');

fs.writeFileSync(outFile, linesOut.join('\n'), 'utf8');
console.log(`Generated SYMBOL_INDEX.md (${linesOut.length} lines)`);
