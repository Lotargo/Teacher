import { test } from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=(path)=>readFileSync(new URL(path,root),'utf8');
test('new directions are substantial published pages, not empty future-course promises',()=>{
 const pages={
  'math/index.html':['id="discount-form"','id="discount-total"','коде'],
  'workshop/index.html':['id="idea-form"','id="idea-output"','Как ты поймёшь'],
  'library/index.html':['id="resource-grid"','class="external-list"','Python Tutor'],
  'library/check-ai/index.html':['class="atlas-article"','article-step','личные данные']
 };
 for(const [page,fragments] of Object.entries(pages)){
  const html=read(page);
  for(const fragment of fragments)assert.ok(html.includes(fragment),page+' missing '+fragment);
 }
});
test('home now opens practice, math, workshop, library and preserves the introduction',()=>{
 const html=read('index.html');
 for(const target of ['./courses/','./math/','./workshop/','./library/','./lessons/first-discovery/']){
  assert.ok(html.includes('href="'+target+'"'),target);
 }
 assert.match(html,/Без оплаты/);
 assert.match(html,/Без сертификатов/);
});
test('workshop content stays inside the browser and calculator never evaluates code',()=>{
 for(const file of ['src/workshop.js','src/life-math.js','src/library.js']){
  assert.ok(existsSync(new URL(file,root)));
  const text=read(file);
  assert.ok(!/\beval\s*\(|\bnew Function\s*\(|\bfetch\s*\(/.test(text));
 }
 assert.match(read('src/workshop.js'),/textContent/);
 assert.ok(!read('src/workshop.js').includes('localStorage'));
});
test('external resources identify independent sources and use safe links',()=>{
 const html=read('library/index.html');
 for(const site of ['scratch.mit.edu','geogebra.org','developer.mozilla.org','pythontutor.com'])assert.ok(html.includes(site),site);
 assert.ok((html.match(/target="_blank" rel="noopener noreferrer"/g)||[]).length>=4);
});
test('main learning pathway remains a real introduction, not a fabricated course',()=>{
 const text=read('src/catalog.js');
 assert.match(text,/status:'planned'/);
 assert.match(text,/storageKey: 'aga-connected-story-v2'/);
});
