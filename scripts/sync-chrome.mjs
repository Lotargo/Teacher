// The generated landmarks are committed, so navigation works without JS or a build server.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { PIXIE_ENABLED } from '../src/features.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const pages = [
  ['index.html', './', 'home'],
  ['courses/index.html', '../', 'catalog'],
  ['courses/start/index.html', '../../', 'start'],
  ['lessons/first-discovery/index.html', '../../', 'lesson'],
  ['math/index.html', '../', 'math'],
  ['workshop/index.html', '../', 'workshop'],
  ['library/index.html', '../', 'library'],
  ['library/check-ai/index.html', '../../', 'article'],
  ['faq/index.html', '../', 'faq'],
];
const check = process.argv.includes('--check');
let changed = false;
for (const [path, prefix, page] of pages) {
  let html = readFileSync(resolve(root, path), 'utf8');
  const original = html;
  const values = { root:prefix, pixLoader: PIXIE_ENABLED ? '<script type="module" src="' + prefix + 'src/pix-guide.js"></script>' : '' };
  for (const name of ['home', 'catalog', 'math', 'workshop', 'library', 'faq']) {
    const active = page === name
      || (name === 'catalog' && (page === 'start' || page === 'lesson'))
      || (name === 'library' && page === 'article');
    values[name + 'Class'] = active ? ' is-active' : '';
    values[name + 'Current'] = active ? ' aria-current="' + (page === 'lesson' ? 'location' : 'page') + '"' : '';
  }
  values.action = page === 'lesson'
    ? '<a class="button lime header-action" href="' + prefix + 'courses/start/">К выбору занятия <span aria-hidden="true">↗</span></a>'
    : '<a class="button lime header-action" href="' + prefix + 'lessons/first-discovery/" data-resume data-resume-compact>Попробовать ↗</a>';
  for (const kind of ['header', 'footer']) {
    const template = readFileSync(resolve(root, 'templates/' + kind + '.html'), 'utf8');
    const content = template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      if (!(key in values)) throw Error('Unknown template key: ' + key);
      return values[key];
    });
    const start = '<!-- site-' + kind + ':start -->';
    const end = '<!-- site-' + kind + ':end -->';
    const from = html.indexOf(start), to = html.indexOf(end, from);
    if (from < 0 || to < 0) throw Error('Missing chrome markers in ' + path);
    html = html.slice(0, from) + start + '\n' + content + '\n' + end + html.slice(to + end.length);
  }
  html = html.replace(/<!-- site-theme:start -->[\s\S]*?<!-- site-theme:end -->\n?/g, '');
  const theme = '<!-- site-theme:start -->\n<script src="' + prefix + 'src/theme-init.js"></script>\n<!-- site-theme:end -->\n';
  const titleAt = html.indexOf('<title>');
  html = html.slice(0, titleAt) + theme + html.slice(titleAt);
  html = html.replace(/<link rel="stylesheet" href="[^"\n]*styles\/theme.css">\n?/g, '');
  html = html.replace(/<link rel="stylesheet" href="[^"\n]*styles\/depth.css">\n?/g, '');
  html = html.replace('</head>', '<link rel="stylesheet" href="' + prefix + 'styles/theme.css">\n<link rel="stylesheet" href="' + prefix + 'styles/depth.css">\n</head>');
  if (html !== original) {
    changed = true;
    if (!check) writeFileSync(resolve(root, path), html);
    console.log((check ? 'Stale chrome: ' : 'Updated chrome: ') + path);
  }
}
if (check && changed) process.exitCode = 1;
