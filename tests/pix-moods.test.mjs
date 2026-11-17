import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { EXPRESSIONS, spritePosition, nextIdleExpression, createMoodController } from '../src/pix-moods.js';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
function setup() {
  let now=0, id=0; const queue=new Map(), frames=[];
  const later=(fn,delay)=>{queue.set(++id,{at:now+delay,fn});return id;};
  const tick=ms=>{const end=now+ms;let cycles=0;while(true){const item=[...queue].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!item)break;if(++cycles>1000)throw new Error('Timer loop');now=item[1].at;queue.delete(item[0]);item[1].fn();}now=end;};
  const moods=createMoodController((state,expression)=>frames.push({state,expression}),{later,cancel:key=>queue.delete(key),random:()=>0,idleMin:24000,idleMax:48000});
  return {moods,tick,frames,queue,last:()=>frames.at(-1)};
}
test('Pack mapping has 20 unique cells and safe sprite offsets',()=>{
  assert.equal(EXPRESSIONS.length,20);assert.equal(new Set(EXPRESSIONS).size,20);
  assert.deepEqual(spritePosition('wave'),{x:0,y:0});
  assert.deepEqual(spritePosition('relax'),{x:100,y:200/3});
  assert.deepEqual(spritePosition('idle-e'),{x:100,y:100});
  assert.equal(spritePosition('unknown'),null);
  for(const value of [0,.5,1,-2,NaN])assert.notEqual(nextIdleExpression('reading',()=>value),'reading');
  for(const file of ['assets/pix/expressions.avif','assets/pix/expressions-2.avif','assets/pix/expressions-3.avif','assets/pix/expressions-4.avif','assets/pix/portrait.avif','assets/pix/manifest.json'])assert.ok(existsSync(new URL(file,root)));
});
test('The first avatar stays unchanged despite the local unread greeting',()=>{
  const {moods,tick,last}=setup();moods.setUnread(1,{initial:true});
  assert.deepEqual(last(),{state:'hello',expression:null});tick(6999);assert.equal(last().state,'hello');tick(1);assert.deepEqual(last(),{state:'unread',expression:'help'});
  moods.setUnread(0);assert.equal(last().state,'hello');moods.dispose();
});
test('Thinking and writing outrank random poses and unread notifications',()=>{
  const {moods,tick,last}=setup();moods.setUnread(2);moods.setActivity('thinking');tick(60000);
  assert.deepEqual(last(),{state:'thinking',expression:'thinking'});
  moods.setActivity('typing');assert.deepEqual(last(),{state:'typing',expression:'writing'});
  moods.setActivity('idea');assert.equal(last().state,'unread');moods.setUnread(0);assert.equal(last().state,'idea');
  tick(6500);assert.equal(last().state,'hello');moods.dispose();
});
test('Idle poses are occasional, restore the unread state, and stop when paused',()=>{
  const {moods,tick,last,queue}=setup();moods.setUnread(1);tick(24000);
  assert.equal(last().state,'idle');tick(6500);assert.equal(last().state,'unread');
  moods.pause();assert.equal(queue.size,0);tick(100000);assert.equal(last().state,'unread');
  moods.setActivity('thinking');assert.equal(last().state,'thinking');
  moods.setActivity('hello');moods.resume();tick(24000);assert.equal(last().state,'idle');
  moods.dispose();assert.equal(queue.size,0);
});
test('Site copy has no provider badges but retains privacy and personal origin',()=>{
  const faq=read('faq/index.html'), visible=faq.replace(/<[^>]*>/g,'');
  assert.doesNotMatch(visible,/Cloudflare|Gemma|Turnstile|API-ключ/i);
  for(const marker of ['Изначально я делал для себя','Учиться вместе веселее','внешним сервисом','до восьми','Донаты на этом сайте не принимаются'])assert.ok(faq.includes(marker),marker);
  assert.ok(faq.includes('assets/pix/portrait.avif'));assert.ok(!faq.includes('faq-mascot-pose'));
  const html=read('index.html');assert.equal((html.match(/<li class="value-chip/g)||[]).length,4);
  assert.ok(html.includes('<ul class="value-strip"'));assert.ok(!html.includes('<span>Без опыта</span>'));
});
test('Browser hooks stop random activity when the page is hidden or motion is disabled',()=>{
  const js=read('src/pix-guide.js');
  for(const marker of ['syncMoodMotion','moodMotion.matches','moods.pause()',"pose('typing')","moods.setUnread(count, options)","attributeFilter:['class']"]){assert.ok(js.includes(marker),marker);}
  assert.doesNotMatch(read('src/pix-moods.js'),/\b(fetch|XMLHttpRequest)\s*\(/);
});
