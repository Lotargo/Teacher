import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { learningPaths, introLesson, readLessonProgress } from '../src/catalog.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const pages = ['index.html','courses/index.html','courses/start/index.html','lessons/first-discovery/index.html','math/index.html','workshop/index.html','library/index.html','library/check-ai/index.html'];
const storage = value => ({ getItem:() => typeof value === 'string' ? value : JSON.stringify(value) });

test('every destination is a real independently loadable HTML document', () => {
  for (const page of pages) {
    const html=readFileSync(resolve(root,page),'utf8');
    assert.match(html,/<!doctype html>/i); assert.match(html,/<html lang="ru">/);
    assert.match(html,/<title>[^<]+<\/title>/); assert.match(html, /id="main"/);
  }
});
test('all local href/src paths work from a nested GitHub Pages directory', () => {
  for (const page of pages) {
    const html=readFileSync(resolve(root,page),'utf8');
    for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      const link=match[1]; if (/^(https?:|data:|#)/.test(link)) continue;
      assert.ok(!link.startsWith('/'), 'Root-relative URL breaks a project site: '+link);
      const target=resolve(dirname(resolve(root,page)),link.split(/[?#]/)[0]);
      assert.ok(existsSync(target),page+' → '+link);
      if (statSync(target).isDirectory()) assert.ok(existsSync(resolve(target,'index.html')));
    }
  }
});
test('catalog keeps orientation separate from unpublished courses', () => {
  assert.equal(learningPaths[0].kind,'Знакомство');
  const ids=new Set();
  for (const path of learningPaths) {
    assert.ok(!ids.has(path.id));ids.add(path.id);
    if (path.status === 'planned') { assert.equal(path.lessons.length,0); assert.equal(path.href,undefined); continue; }
    assert.ok(existsSync(resolve(root,path.href,'index.html')));
    for (const lesson of path.lessons) assert.ok(existsSync(resolve(root,lesson.href,'index.html')));
  }
});
test('existing completion and draft namespace is preserved', () => {
  assert.equal(introLesson.storageKey,'aga-connected-story-v2');
  const p=readLessonProgress(introLesson,storage({done:['add','undo','name'],drafts:{show:'print(8)'}}));
  assert.equal(p.count,3); assert.equal(p.next,'show'); assert.equal(p.fragment,'#code');
});
test('progress rejects corrupt, missing, duplicate and unknown entries', () => {
  for (const value of ['{bad','null','8','[]', {done:'add'}]) assert.equal(readLessonProgress(introLesson,storage(value)).count,0);
  assert.equal(readLessonProgress(introLesson,storage({done:['add','add','bogus',3]})).count,1);
  assert.equal(readLessonProgress(introLesson,{getItem(){throw Error('blocked')}}).count,0);
});
test('resume follows the first unsolved step and distinguishes completion', () => {
  assert.equal(readLessonProgress(introLesson,storage({done:[]})).fragment,'');
  assert.equal(readLessonProgress(introLesson,storage({done:['add']})).fragment,'#backward');
  const full=readLessonProgress(introLesson,storage({done:introLesson.taskIds}));
  assert.ok(full.complete); assert.equal(full.fragment,'#finish');
});
test('public README is a presentation, developer instructions live elsewhere', () => {
  const readme=readFileSync(resolve(root,'README.md'),'utf8');
  assert.ok(!/npm |pip |http\.server|## Запуск|## Установка/.test(readme));
  assert.match(readme,/readme-cover.svg/); assert.ok(existsSync(resolve(root,'docs/DEVELOPMENT.md')));
});
