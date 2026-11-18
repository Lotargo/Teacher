import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { claimGreeting } from '../src/pix-session.js';
import { workshopPrompt } from '../src/workshop-core.js';
import { buildAiMessages } from '../src/pix-core.js';
import { PixieError, friendlyError, classifyFailure, ERROR_TEXT } from '../src/pix-errors.js';
import { askCloudflare, readCloudflareStream } from '../src/cloudflare-adapter.js';
import worker from '../cloudflare/worker.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const request=()=>new Request('https://worker.test/chat',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test',Accept:'text/event-stream'},body:JSON.stringify({messages:[{role:'user',content:'Привет'}]})});
const sse=events=>new ReadableStream({start(c){const enc=new TextEncoder();for(const event of events)c.enqueue(enc.encode('data: '+(typeof event==='string'?event:JSON.stringify(event))+'\n\n'));c.close();}});
const greetingKey = 'aga:Teacher:pix-greeting-shown:v1';

test('Welcome notification is claimed once across page loads, not tied to chat history',()=>{
 const values=new Map();const store={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 assert.equal(claimGreeting(store),true);
 for(let i=0;i<9;i++)assert.equal(claimGreeting(store),false);
 assert.deepEqual([...values],[[greetingKey,'1']]);
 assert.equal(claimGreeting({getItem(){throw Error('blocked')}}),false);
 assert.equal(claimGreeting({getItem(){return null},setItem(){throw Error('quota')}}),false);
});

test('A legacy welcome flag migrates without notifying again and survives a failed write', () => {
  const legacyKey = 'aga:Teacher-:pix-greeting-shown:v1';
  const values = new Map([[legacyKey, '1']]);
  const store = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };

  assert.equal(claimGreeting({ ...store, setItem() { throw Error('quota'); } }), false);
  assert.deepEqual([...values], [[legacyKey, '1']]);
  assert.equal(claimGreeting(store), false);
  assert.deepEqual([...values], [[greetingKey, '1']]);
  assert.equal(claimGreeting(store), false);
});

test('All pages load the early theme bootstrap and the shared stylesheet',()=>{
 for(const path of ['index.html','courses/index.html','courses/start/index.html','lessons/first-discovery/index.html','math/index.html','workshop/index.html','library/index.html','library/check-ai/index.html','faq/index.html']){
  const html=read(path);
  assert.equal((html.match(/src\/theme-init.js/g)||[]).length,1,path);
  assert.equal((html.match(/styles\/theme.css/g)||[]).length,1,path);
  assert.ok(html.indexOf('src/theme-init.js')<html.indexOf('styles/lesson.css'),path);
  assert.ok(html.includes('data-theme-toggle'),path);
 }
 assert.ok(read('src/theme-init.js').includes('localStorage.setItem'));
 assert.ok(read('src/theme-init.js').includes("addEventListener('storage'"));
});

test('Workshop transmits all four fields at their maximum lengths without silent truncation',()=>{
 const fields={idea:'а'.repeat(400),audience:'б'.repeat(300),first:'в'.repeat(500),check:'г'.repeat(500)};
 const prompt=workshopPrompt(fields);
 assert.ok(prompt.length<=3000);
 for(const value of Object.values(fields))assert.ok(prompt.includes(value));
 assert.equal(buildAiMessages('workshop',[],prompt,3000)[0].content,prompt);
 assert.throws(()=>workshopPrompt({...fields,idea:'x'.repeat(401)}));
 assert.throws(()=>workshopPrompt({...fields,check:''}));
 assert.ok(read('workshop/index.html').includes('Собрать задание'));
 assert.ok(!read('workshop/index.html').includes('id="idea-ai"'));
 assert.ok(!read('src/workshop.js').includes('askWorkshopPixie'));
 assert.ok(read('workshop/index.html').includes('Поля никуда не отправляются'));
});

test('FAQ keeps the privacy qualification and removes the crossed-out UI questions',()=>{
 const faq=read('faq/index.html');
 for(const removed of ['Почему Пикси уже оставила','Когда включается облачный','Как работает защита','Можно ли выключить звук','Как переместить окно'])assert.ok(!faq.includes(removed));
 for(const text of ['нет собственных cookies','счётчиков статистики','только в твоём браузере','могут обрабатывать технические данные'])assert.ok(faq.includes(text));
});

test('Only explicit safety refusals are labeled as blocked',()=>{
 assert.equal(classifyFailure({code:'content_policy_violation'}),'blocked');
 assert.equal(classifyFailure({message:'Safety check unavailable'}),'unavailable');
 assert.equal(classifyFailure({code:3036}),'quota');
 assert.equal(classifyFailure({code:3040}),'unavailable');
 assert.equal(friendlyError(new Error('Cloudflare stack / secret-token')),ERROR_TEXT.unavailable);
 assert.equal(friendlyError(new PixieError('blocked')),ERROR_TEXT.blocked);
});

test('No raw error message or HTTP code is rendered by the browser adapter',async()=>{
 for(const status of [400,401,403,429,500,502,503,599]){
  await assert.rejects(askCloudflare([{role:'user',content:'test'}],{turnstileToken:'fake',fetcher:async()=>new Response(JSON.stringify({error:'Provider 9999 stack Bearer PRIVATE'}),{status})}),error=>
   error instanceof PixieError&&!/PRIVATE|Provider|9999|Bearer|Cloudflare/.test(error.message));
 }
 await assert.rejects(askCloudflare([],{turnstileToken:'fake',fetcher:async()=>new Response(JSON.stringify({error:{code:'blocked',message:'RAW STACK'}}),{status:422})}),error=>error.code==='blocked'&&!error.message.includes('RAW'));
});

test('Worker policy rejection is sanitized and is not retried as a JSON generation',async()=>{
 let calls=0;
 const env={PILOT_TOKEN:'test',AI:{run:async()=>{calls++;throw Object.assign(new Error('PRIVATE content filter rejection'),{code:'content_policy_violation'});}}};
 const reply=await worker.fetch(request(),env);
 assert.equal(reply.status,422);
 assert.deepEqual(await reply.json(),{error:{code:'blocked'}});
 assert.equal(calls,1);
});

test('Worker SSE strips reasoning, identity and diagnostic errors, browser emits only a friendly failure',async()=>{
 const env={PILOT_TOKEN:'test',AI:{run:async()=>sse([
  {model:'PRIVATE-model',choices:[{delta:{reasoning_content:'PRIVATE-thoughts'}}]},
  {choices:[{delta:{content:'Начало'}}]},
  {error:{code:'content_filter',message:'PRIVATE stack secret'}}
 ])}};
 const response=await worker.fetch(request(),env);
 const text=await response.text();
 assert.ok(!text.includes('PRIVATE'));
 assert.ok(text.includes('blocked'));
 await assert.rejects(readCloudflareStream(sse([{choices:[{delta:{refusal:'PRIVATE refusal'}}]},'[DONE]'])),error=>error.code==='blocked');
 await assert.rejects(readCloudflareStream(sse([{choices:[{delta:{content:'unfinished'}}]}])),error=>error.code==='interrupted');
});

test('Disabled Pixie never appears in any published HTML',()=>{
 const pages=['index.html','courses/index.html','courses/start/index.html','lessons/first-discovery/index.html','math/index.html','workshop/index.html','library/index.html','library/check-ai/index.html','faq/index.html'];
 for(const page of pages)assert.ok(!read(page).includes('src/pix-guide.js'),page);
 assert.match(read('src/features.js'),/PIXIE_ENABLED\s*=\s*false/);
});
test('Light and dark accents and explicit card contrast are maintained',()=>{
 const css=read('styles/theme.css');
 for(const hex of ['#3C9DD0','#FFB782'])assert.ok(css.includes(hex));
 assert.ok(css.includes("html[data-theme='dark'][data-theme] .atlas-steps article{"));
 assert.ok(css.includes("html[data-theme='dark'][data-theme] .direction-card strong"));
 assert.ok(css.includes("html[data-theme='dark'][data-theme] .direction-card>span"));
});
