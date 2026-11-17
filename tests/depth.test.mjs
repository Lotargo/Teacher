import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { depthOffsets, DEPTH_PLANES } from '../src/depth-scene.js';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const pages = ['index.html', 'courses/index.html', 'courses/start/index.html',
  'lessons/first-discovery/index.html', 'math/index.html', 'workshop/index.html',
  'library/index.html', 'library/check-ai/index.html', 'faq/index.html'];

test('paper scene has distinct depth planes and bounded motion', () => {
  assert.equal(Object.keys(DEPTH_PLANES).length, 3);
  assert.ok(DEPTH_PLANES.far < DEPTH_PLANES.middle);
  assert.ok(DEPTH_PLANES.middle < DEPTH_PLANES.near);
  assert.deepEqual(depthOffsets(0, 0, 0), {x:0, y:0, scroll:0, tiltX:0, tiltY:0});
  assert.deepEqual(depthOffsets(2, -2, 3000), {x:22, y:-16, scroll:120, tiltX:2.2, tiltY:2.8});
  assert.deepEqual(depthOffsets(-2, 2, -20), {x:-22, y:16, scroll:0, tiltX:-2.2, tiltY:-2.8});
  assert.ok(Number.isFinite(depthOffsets(NaN, Infinity, Infinity).x));
});

test('every existing HTML page includes diorama CSS, but retains independent content', () => {
  for (const page of pages) {
    const html = read(page);
    const prefix = page.split('/').length === 1 ? './' : '../'.repeat(page.split('/').length-1);
    assert.ok(html.includes('href="' + prefix + 'styles/depth.css"'),page);
    assert.equal((html.match(/styles\/depth\.css/g) || []).length,1,page);
    assert.ok(!html.includes('aga-depth-scene'), 'scene must be inserted only once by the shared JS');
  }
  const site = read('src/site-chrome.js');
  assert.match(site, /import '\.\/depth-scene\.js'/);
  assert.match(read('src/portal.js'),/import '\.\/site-chrome\.js'/);
  assert.match(read('src/lesson-app.js'),/import '\.\/site-chrome\.js'/);
});

test('decorative scene is accessible, privacy-safe and cannot intercept interactions', () => {
  const source = read('src/depth-scene.js');
  const css = read('styles/depth.css');
  assert.ok(source.includes('aria-hidden'));
  assert.match(css, /pointer-events:none/);
  assert.ok(!source.includes('localStorage'));
  assert.ok(!source.includes('fetch('));
  assert.ok(!source.includes('eval('));
  assert.ok(!source.includes('setInterval('));
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /page-hidden/);
  assert.match(source, /classList\.contains\('still'\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /max-width:760px/);
  assert.match(css, /home-stage/);
  assert.ok(!css.includes('z-index:9999'));
});
