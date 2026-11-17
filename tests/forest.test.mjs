import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const images = ['landscape','trees','grass','bear','rabbit','squirrel','fox','hedgehog'];

test('forest parallax uses eight distinct optimized and valid WebP layers', () => {
  let total = 0;
  for (const name of images) {
    const file = new URL('assets/forest/' + name + '.webp', root);
    const image = readFileSync(file);
    assert.equal(image.toString('ascii', 0, 4), 'RIFF', name);
    assert.equal(image.toString('ascii', 8, 12), 'WEBP', name);
    assert.ok(image.length > 2000, name);
    total += statSync(file).size;
  }
  assert.ok(total < 1100000, 'Keep the whole forest under 1.1MB');
});

test('background is fixed for long scrolling, every asset moves in its own plane', () => {
  const css = read('styles/depth.css'), js = read('src/depth-scene.js');
  assert.match(css,/\.aga-depth-scene\{\s*position:fixed;inset:0/);
  for (const name of images) assert.match(css, new RegExp('forest/' + name + '\\.webp'));
  for (const cls of ['aga-depth-far','aga-depth-middle','aga-depth-animals-back',
    'aga-depth-animals-front','aga-depth-foreground']) assert.ok(css.includes('.' + cls));
  for (const name of ['fox','bear','squirrel','rabbit','hedgehog']) assert.ok(js.includes("forestSpot('" + name + "'"), name);
  assert.ok(js.includes('forest-reading-wash'));
  assert.ok(css.includes('mask-image'));
  assert.ok(css.includes('pointer-events:none'));
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/max-width:1600px/);
  assert.match(css,/max-width:760px/);
});

test('diorama never uploads data and Pixie remains inactive', () => {
  const source = read('src/depth-scene.js');
  assert.ok(!source.includes('fetch('));
  assert.ok(!source.includes('localStorage'));
  assert.ok(!source.includes('document.cookie'));
  assert.ok(read('src/features.js').includes('PIXIE_ENABLED = false'));
});


test('animals keep their own grounding and cannot be buried under the grass layer', () => {
  const css = read('styles/depth.css'), js = read('src/depth-scene.js');
  assert.ok(js.includes('data-forest-character'));
  assert.ok(js.includes('forest-contact-shadow'));
  assert.ok(js.includes("forestSpot('fox', rock)"));
  assert.ok(js.includes("forestSpot('squirrel', stump)"));
  const scene = js.slice(js.indexOf('const sceneHTML'), js.indexOf('const heroHTML'));
  assert.ok(scene.indexOf('forest-grass') < scene.indexOf('aga-depth-animals-back'));
  assert.ok(scene.indexOf('forest-reading-wash') < scene.indexOf('aga-depth-animals-back'));
  assert.ok(css.includes('.aga-depth-animals-back,.aga-depth-animals-front{inset:0;transform:none}'));
  assert.ok(css.includes('--forest-rail:clamp(276px,'));
  assert.ok(css.includes('body.still .forest-spot'));
});
