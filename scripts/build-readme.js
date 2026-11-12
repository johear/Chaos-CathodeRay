#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Chaos CathodeRay — Copyright © 2026 Jonathan O'Hear. See LICENSE and NOTICE.md.
'use strict';
// README.md → README.html: a self-contained, offline page that opens in any browser
// (double-click it next to Chaos-CathodeRay.html). Zero dependencies; supports the Markdown
// the README uses: headings, paragraphs, bold/italic/code, links, images, nested lists,
// tables, fenced code blocks, horizontal rules.

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const md = fs.readFileSync(path.join(root, 'README.md'), 'utf8').replace(/\r\n/g, '\n');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function inline(text) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s);
  // Images: external images (badges) become text pills so the page works offline.
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt) => `<span class="pill">${alt}</span>`);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const htmlTwin = { './LICENSE': './LICENSE.html', './NOTICE.md': './NOTICE.html', './TRADEMARK.md': './TRADEMARK.html', './CLA.md': './CLA.html', './README.md': './README.html', './TESTERS.md': './TESTERS.html' };
    if (htmlTwin[href]) href = htmlTwin[href];
    const ext = /^https?:/.test(href);
    return `<a href="${href}"${ext ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[Number(i)])}</code>`);
  return s;
}

function convert(md) {
  const lines = md.split('\n');
  const out = [];
  const toc = [];
  let i = 0;
  let title = 'README';

  function parseList(start) {
    // Returns [html, nextIndex]. Handles nesting by indentation (2–3 spaces per level).
    const items = [];
    const baseIndent = lines[start].match(/^\s*/)[0].length;
    const ordered = /^\s*\d+\.\s/.test(lines[start]);
    let j = start;
    while (j < lines.length) {
      const ln = lines[j];
      const m = ln.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
      if (!m) break;
      const ind = m[1].length;
      if (ind < baseIndent) break;
      if (ind > baseIndent) {
        const [sub, nj] = parseList(j);
        if (items.length) items[items.length - 1] += sub;
        j = nj;
        continue;
      }
      items.push(/^\[[ xX]\] /.test(m[3]) ? `<span class="check" aria-hidden="true">${/^\[[xX]\]/.test(m[3]) ? '☑' : '☐'}</span> ${inline(m[3].slice(4))}` : inline(m[3]));
      j++;
    }
    const tag = ordered ? 'ol' : 'ul';
    return [`<${tag}>${items.map(x => `<li>${x}</li>`).join('')}</${tag}>`, j];
  }

  while (i < lines.length) {
    const ln = lines[i];
    if (!ln.trim()) { i++; continue; }

    const fence = ln.match(/^```(\w*)/);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${buf.map(l => esc(l).replace(/^(#.*)$/, '<span class="cm">$1</span>')).join('\n')}</code></pre>`);
      continue;
    }

    const h = ln.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const html = inline(h[2]);
      if (level === 1) { title = h[2].replace(/[*`]/g, ''); out.push(`<h1>${html}</h1>`); }
      else {
        const id = slug(html);
        if (level === 2) toc.push({ id, html });
        out.push(`<h${level} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${html}</h${level}>`);
      }
      i++;
      continue;
    }

    if (/^---+\s*$/.test(ln)) { out.push('<hr>'); i++; continue; }

    if (/^\s*([-*]|\d+\.)\s+/.test(ln)) {
      const [html, ni] = parseList(i);
      out.push(html);
      i = ni;
      continue;
    }

    if (ln.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      out.push(`<div class="table-wrap"><table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }

    // Paragraph: gather consecutive plain lines.
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\||---+\s*$|\s*([-*]|\d+\.)\s+)/.test(lines[i])) buf.push(lines[i++]);
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }

  return { out, toc, title };
}

const { out, toc } = convert(md);

// The intro (everything before the first h2) becomes the hero; a contents list follows.
const firstH2 = out.findIndex(x => x.startsWith('<h2'));
const hero = out.slice(0, firstH2).filter(x => x !== '<hr>');
const rest = out.slice(firstH2);
const tocHtml = `<nav class="toc" aria-label="Contents"><span class="toc-lbl">Contents</span>${toc.map(t => `<a href="#${t.id}">${t.html.replace(/<\/?a[^>]*>/g, '')}</a>`).join('')}</nav>`;

const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chaos CathodeRay — Read Me</title>
<style>
  :root {
    --bg: #070b13; --panel: #0e1420; --ink: #e6edf7; --muted: #93a3ba; --line: rgba(255,255,255,0.09);
    --brand: #6fd3ff; --warm: #ffcb7d; --emerald: #34e89e; --code-bg: rgba(111,211,255,0.08);
    color-scheme: dark;
  }
  @media (prefers-color-scheme: light) {
    :root:not([data-theme="dark"]) {
      --bg: #f6f8fb; --panel: #ffffff; --ink: #141a24; --muted: #5a6577; --line: rgba(0,0,0,0.1);
      --brand: #0a7fb5; --warm: #a8620a; --emerald: #0d8a5a; --code-bg: rgba(10,127,181,0.08);
      color-scheme: light;
    }
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
  .wrap { max-width: 880px; margin: 0 auto; padding: 0 16px 80px; }
  header.hero { padding: 48px 0 24px; border-bottom: 1px solid var(--line); margin-bottom: 8px; }
  .mark { color: var(--brand); font-size: 22px; margin-right: 6px; }
  h1 { font-size: clamp(26px, 5vw, 38px); line-height: 1.15; margin: 0 0 14px; letter-spacing: 0.01em; }
  .hero p { margin: 8px 0; }
  .hero p:first-of-type { font-size: 17px; }
  .hero em { color: var(--muted); }
  .launch { display: inline-flex; align-items: center; gap: 8px; margin: 16px 0 4px; padding: 10px 18px; border-radius: 10px; background: var(--brand); color: #04121c; font-weight: 700; text-decoration: none; }
  .launch:hover { filter: brightness(1.08); }
  .launch.ghost { background: transparent; color: var(--brand); border: 1px solid var(--brand); margin-left: 8px; }
  li:has(> .check) { list-style: none; margin-left: -1.2em; }
  .check { color: var(--brand); margin-right: 4px; }
  .pill { display: inline-block; padding: 2px 9px; border-radius: 10px; border: 1px solid var(--emerald); color: var(--emerald); font-size: 12px; font-weight: 600; }
  .toc { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: center; padding: 10px 0; background: color-mix(in srgb, var(--bg) 92%, transparent); backdrop-filter: blur(8px); border-bottom: 1px solid var(--line); font-size: 13px; }
  .toc-lbl { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
  .toc a { color: var(--ink); text-decoration: none; opacity: 0.85; }
  .toc a:hover { color: var(--brand); opacity: 1; }
  h2 { font-size: 23px; margin: 44px 0 12px; padding-top: 8px; scroll-margin-top: 56px; }
  h3 { font-size: 17px; margin: 28px 0 8px; color: var(--brand); scroll-margin-top: 56px; }
  .anchor { color: var(--muted); text-decoration: none; margin-left: -0.9em; padding-right: 0.25em; opacity: 0; font-weight: 400; }
  h2:hover .anchor, h3:hover .anchor { opacity: 0.6; }
  a { color: var(--brand); }
  strong { color: var(--ink); }
  code { font: 0.86em ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: var(--code-bg); padding: 1px 5px; border-radius: 4px; }
  pre { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; overflow-x: auto; }
  pre code { background: none; padding: 0; font-size: 13px; line-height: 1.55; }
  .cm { color: var(--muted); }
  ul, ol { padding-left: 1.4em; }
  li { margin: 4px 0; }
  li > ul, li > ol { margin: 4px 0; }
  ol > li::marker { color: var(--brand); font-weight: 700; }
  hr { border: 0; border-top: 1px solid var(--line); margin: 36px 0; }
  .start { background: var(--panel); border: 1px solid color-mix(in srgb, var(--brand) 40%, var(--line)); border-radius: 14px; padding: 4px 22px 14px; margin-top: 28px; }
  .start h2 { margin-top: 18px; }
  .table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 10px; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { background: var(--panel); font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
  tr:last-child td { border-bottom: 0; }
  td:last-child { white-space: nowrap; }
  footer { margin-top: 56px; color: var(--muted); font-size: 12px; }
  @media (max-width: 600px) {
    body { font-size: 14.5px; }
    td:last-child { white-space: normal; }
    .start { padding: 2px 14px 10px; }
    .toc { position: static; }
  }
</style>
</head>
<body>
<div class="wrap">
<header class="hero">
${hero.join('\n').replace('<h1>', '<h1><span class="mark" aria-hidden="true">◈</span>')}
<a class="launch" href="./Chaos-CathodeRay.html">▶ Open Chaos CathodeRay</a>
</header>
${tocHtml}
<main>
${rest.join('\n')
  .replace(/(<h2 id="beta-testers-start-here">[\s\S]*?)(<hr>)/, '<section class="start">$1</section>$2')}
</main>
<footer>Generated from README.md by <code>scripts/build-readme.js</code>. Open <a href="./Chaos-CathodeRay.html">Chaos-CathodeRay.html</a> to start.</footer>
</div>
</body>
</html>
`;

fs.writeFileSync(path.join(root, 'README.html'), page, 'utf8');

// Companion pages in the same look: LICENSE (verbatim text) + NOTICE, TRADEMARK, CLA (Markdown).
function docPage(titleText, heading, bodyHtml, extraCss = '', heroLink = '<a class="launch" href="./README.html">← Back to the Read Me</a>') {
  return page
    .replace(/<title>[^<]*<\/title>/, `<title>Chaos CathodeRay — ${titleText}</title>`)
    .replace(/<div class="wrap">[\s\S]*<\/div>\n<\/body>/, () => `<div class="wrap">
<header class="hero"><h1><span class="mark" aria-hidden="true">◈</span>${heading}</h1>
${heroLink}
</header>
<main>${bodyHtml}</main>
<footer>Copyright © 2026 Jonathan O'Hear · <a href="./LICENSE.html">Licence</a> · <a href="./NOTICE.html">Notice &amp; terms</a> · <a href="./TRADEMARK.html">Trademark policy</a> · <a href="./CLA.html">Contributor licence agreement</a></footer>
</div>
</body>`)
    .replace('</style>', `${extraCss}</style>`);
}

const licenseText = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8');
fs.writeFileSync(path.join(root, 'LICENSE.html'), docPage('Licence (AGPL-3.0)', 'GNU Affero General Public License v3',
  `<p>Chaos CathodeRay is licensed under this licence, version 3 or any later version, with the additional terms and permissions in the <a href="./NOTICE.html">Notice</a>.</p><pre class="license"><code>${esc(licenseText)}</code></pre>`,
  '  pre.license { white-space: pre-wrap; word-break: break-word; }\n  pre.license code { font-size: 12.5px; }\n'), 'utf8');

const built = ['LICENSE.html'];
for (const [src, out, label] of [['TESTERS.md', 'TESTERS.html', 'Beta tester guide'], ['NOTICE.md', 'NOTICE.html', 'Notice & terms'], ['TRADEMARK.md', 'TRADEMARK.html', 'Trademark policy'], ['CLA.md', 'CLA.html', 'Contributor licence agreement']]) {
  const file = path.join(root, src);
  if (!fs.existsSync(file)) continue;
  const doc = convert(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
  const h1 = doc.out.find(x => x.startsWith('<h1>'));
  const heading = h1 ? h1.replace(/<\/?h1>/g, '') : label;
  const hero = src === 'TESTERS.md' ? '<a class="launch" href="./Chaos-CathodeRay.html">▶ Open Chaos CathodeRay</a> <a class="launch ghost" href="./README.html">Read Me</a>' : undefined;
  fs.writeFileSync(path.join(root, out), docPage(label, heading, doc.out.filter(x => x !== h1).join('\n'), '', hero), 'utf8');
  built.push(out);
}
console.log(`Built README.html (${toc.length} sections) + ${built.join(', ')}`);
