import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const assets = ['team','chaos','thoughts','debug','surf'];

test('home uses five distinct approved illustrations, not a screenshot of text', () => {
  for (const asset of assets) assert.match(html, new RegExp('assets/home/'+asset+'\\.avif'));
  assert.equal((html.match(/class="story-card /g) || []).length,4);
  assert.ok(!html.includes('assets/pix.webp'));
  assert.match(html, /<h1 id="home-title">/);
  assert.match(html, /href="\.\/courses\/">Выбрать свой первый шаг/);
  assert.match(html, /id="how-it-works"/);
});
test('illustrations have reserved space, alt text and appropriate loading hints', () => {
  const images=[...html.matchAll(/<img\b[^>]*src="\.\/assets\/home\/[^>]+>/g)].map(m=>m[0]);
  assert.equal(images.length,5);
  for (const image of images) {
    assert.match(image,/width="\d+"/); assert.match(image,/height="\d+"/);
    assert.match(image,/alt="[^"]+"/); assert.match(image,/decoding="async"/);
  }
  assert.match(images[0],/fetchpriority="high"/);
  assert.ok(!images[0].includes('loading="lazy"'));
  for (const image of images.slice(1)) assert.match(image,/loading="lazy"/);
});
test('committed AVIF assets are real images within the homepage budget', () => {
  let bytes=0;
  for (const asset of assets) {
    const file=new URL('assets/home/'+asset+'.avif',root);
    const data=readFileSync(file);
    assert.equal(data.toString('ascii',4,8),'ftyp');
    assert.ok(data.subarray(8,32).includes(Buffer.from('avif')));
    assert.ok(data.length>1000);bytes+=statSync(file).size;
  }
  assert.ok(bytes < 160000,'Five illustrations should stay below 160 kB, not use original multi-MB PNGs');
});
test('homepage styles stay isolated and motion requires an observer and user consent', () => {
  const css=readFileSync(new URL('styles/home.css',root),'utf8');
  const js=readFileSync(new URL('src/portal.js',root),'utf8');
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/animation-play-state:paused/);
  assert.match(css,/motion-ready:not\(\.still\)/);
  assert.match(readFileSync(new URL('src/site-chrome.js',root),'utf8'),/visibilitychange/);
  assert.match(js,/IntersectionObserver/);
  assert.ok(!readFileSync(new URL('courses/index.html',root),'utf8').includes('styles/home.css'));
  assert.ok(!readFileSync(new URL('lessons/first-discovery/index.html',root),'utf8').includes('styles/home.css'));
});
