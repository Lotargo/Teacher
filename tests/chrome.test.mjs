import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const pages = ['index.html','courses/index.html','courses/start/index.html','lessons/first-discovery/index.html','math/index.html','workshop/index.html','library/index.html','library/check-ai/index.html'];
test('all eight pages have one static shared header and footer outside main', () => {
  for (const page of pages) {
    const html = readFileSync(new URL(page,root),'utf8');
    assert.equal((html.match(/<header class="site-header"/g)||[]).length,1,page);
    assert.equal((html.match(/<footer class="site-footer"/g)||[]).length,1,page);
    assert.ok(html.indexOf('<header class="site-header"') < html.indexOf('<main'),page);
    assert.ok(html.indexOf('<footer class="site-footer"') > html.indexOf('</main>'),page);
    assert.match(html,/id="page-top" class="page-top-anchor"/);
    assert.match(html,/aria-controls="site-menu"/);
    assert.match(html,/styles\/chrome.css/);
    assert.match(html,/href="#page-top"/);
  }
});
test('header marks exactly one active location without pretending the lesson is a course page', () => {
  for (const page of pages) {
    const html = readFileSync(new URL(page,root),'utf8');
    const header = html.match(/<header class="site-header">([\s\S]*?)<\/header>/)[1];
    assert.equal((header.match(/aria-current=/g)||[]).length,1,page);
    assert.ok(header.includes(page.startsWith('lessons/') ? 'aria-current="location"' : 'aria-current="page"'));
  }
});
test('static chrome is synchronized with reusable templates', () => {
  const result = spawnSync(process.execPath,['scripts/sync-chrome.mjs','--check'],{cwd:fileURLToPath(root),encoding:'utf8'});
  assert.equal(result.status,0,result.stdout + result.stderr);
});
test('shared mobile control and motion preference are loaded by both entrypoints', () => {
  for (const entry of ['portal.js','lesson-app.js']) {
    assert.match(readFileSync(new URL('src/'+entry,root),'utf8'), /import '\.\/site-chrome.js'/);
  }
  const js=readFileSync(new URL('src/site-chrome.js',root),'utf8');
  assert.match(js,/Escape/); assert.match(js,/aria-expanded/);
  assert.match(js,/prefers-reduced-motion/); assert.match(js,/aga-motion/);
  assert.match(js,/pageshow/); assert.match(js,/storage/);
});

test('lesson footer stays in the same shell as the sticky sidebar', () => {
  const html = readFileSync(new URL('lessons/first-discovery/index.html', root), 'utf8');
  assert.match(html, /<\/main>\s*<!-- site-footer:start -->/);
  assert.match(html, /<!-- site-footer:end -->\s*<\/div>/);
});
