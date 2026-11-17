import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { getPageContext, getSuggestions, getLocalAnswer, guessLocalIntent, buildAiMessages, PATHS } from '../src/pix-core.js';
import { askCloudflare, readCloudflareStream } from '../src/cloudflare-adapter.js';
import { CLOUDFLARE_CHAT_URL, TURNSTILE_SITE_KEY } from '../src/cloudflare-config.js';
const root = new URL('../', import.meta.url);
const read = file => readFileSync(new URL(file,root),'utf8');

test('Pix local guide remains usable with no account, API or Cloudflare',()=>{
  assert.ok(getSuggestions('lesson').some(item=>item.id==='lesson'));
  assert.match(getLocalAnswer('lesson').text,/Подсказка/);
  assert.equal(guessLocalIntent('Как посчитать скидку?'),'math');
  assert.equal(guessLocalIntent('Хочу сделать сайт'),'idea');
  assert.equal(getPageContext('workshop').route,'workshop');
  assert.equal(getPageContext('unknown').route,'home');
  for(const route of Object.values(PATHS))assert.ok(route.path&&route.label);
});

test('Only the recent conversation is sent; no browser system instruction',()=>{
  const prev=Array.from({length:25},(_,i)=>({role:i%2===0?'user':'assistant',content:'x'.repeat(9000)}));
  const messages=buildAiMessages('lesson',prev,'x'.repeat(9000));
  assert.equal(messages.length,9);
  assert.ok(messages.slice(0,8).every(m=>m.content.length===1500));
  assert.ok(messages.every(m=>m.role==='user'||m.role==='assistant'));
  assert.equal(messages.at(-1).content.length,1200);
});

test('Cloudflare adapter uses POST /chat, owner token only from local input, and text output',async()=>{
  assert.match(CLOUDFLARE_CHAT_URL,/^https:\/\/.+\.workers\.dev\/chat$/);
  assert.equal(TURNSTILE_SITE_KEY,'');
  let called;
  const fetcher=async(url,options)=>{
    called={url,options};
    return new Response(JSON.stringify({reply:'<b>Привет!</b>'}),{
      headers:{'Content-Type':'application/json'}
    });
  };
  const reply=await askCloudflare([{role:'user',content:'привет'}],{
    page:'math',ownerToken:'test-pilot-token',fetcher
  });
  assert.equal(reply,'<b>Привет!</b>');
  assert.equal(called.url,CLOUDFLARE_CHAT_URL);
  assert.equal(called.options.method,'POST');
  assert.equal(called.options.mode,'cors');
  assert.equal(called.options.headers.Authorization,'Bearer test-pilot-token');
  assert.deepEqual(JSON.parse(called.options.body),{
    messages:[{role:'user',content:'привет'}],page:'math'
  });
  await assert.rejects(askCloudflare([{role:'user',content:'hi'}],{fetcher}),/Подтверди доступ/);
});

test('Cloudflare adapter reports failures without echoing remote errors or secrets',async()=>{
  const fetcher=async()=>new Response(JSON.stringify({error:'Bearer secret should stay hidden'}),{status:401});
  await assert.rejects(
    askCloudflare([{role:'user',content:'hi'}],{ownerToken:'secret',fetcher}),
    error=>/Неверный токен/.test(error.message)&&!/secret/i.test(error.message)
  );
  await assert.rejects(
    askCloudflare([{role:'user',content:'hi'}],{
      turnstileToken:'public-token',fetcher:async()=>new Response('{}',{status:503})
    }),/временно недоступен/
  );
});

test('No Puter code or client-side storage of sensitive data is shipped',()=>{
  const ui=read('src/pix-guide.js'), adapter=read('src/cloudflare-adapter.js');
  assert.ok(!existsSync(new URL('src/puter-adapter.js',root)));
  assert.ok(!ui.includes('Puter'));
  assert.ok(!ui.includes('puter.com'));
  assert.ok(!ui.includes('localStorage.setItem'));
  assert.ok(!ui.includes('innerHTML = reply'));
  assert.ok(ui.includes('body.textContent = text'));
  assert.ok(ui.includes("get('#pix-connect-cloudflare').addEventListener('click'"));
  assert.ok(ui.includes('loadTurnstile()'));
  assert.ok(!/localStorage\\.(setItem|getItem)|sessionStorage\\./.test(adapter));
  assert.ok(!read('src/cloudflare-config.js').includes('Bearer '));
  for(const file of ['assets/pix-guide.webp','styles/pix.css','faq/index.html'])assert.ok(existsSync(new URL(file,root)),file);
});

test('FAQ and layout retain clear opt-in and privacy explanation',()=>{
  const faq=read('faq/index.html');
  for(const marker of ['Бесплат','Cloudflare','приват','доброволь','Turnstile','квот']){
    assert.match(faq.toLowerCase(),new RegExp(marker.toLowerCase()),marker);
  }
  assert.ok((faq.match(/<details/g)||[]).length>=8);
  assert.ok(read('templates/header.html').includes('href="{{root}}faq/"'));
  assert.ok(read('templates/footer.html').includes('src/pix-guide.js'));
});

test('Gemma SSE is parsed incrementally, ignoring reasoning and handling split chunks',async()=>{
  const encoder=new TextEncoder();
  const content=[
    'data: {"choices":[{"delta":{"reasoning_content":"internal"}}]}\\n\\n',
    'data: {"choices":[{"delta":{"content":"Привет, "}}]}\\n\\n',
    'data: {"choices":[{"delta":{"content":"Пикс!"}}]}\\n\\n',
    'data: [DONE]\\n\\n'
  ].join('').replaceAll('\\n','\n');
  const bytes=encoder.encode(content);
  const body=new ReadableStream({
    start(controller) {
      for(let i=0;i<bytes.length;i+=11) controller.enqueue(bytes.slice(i,i+11));
      controller.close();
    }
  });
  const deltas=[];
  const result=await readCloudflareStream(body,delta=>deltas.push(delta));
  assert.equal(result,'Привет, Пикс!');
  assert.deepEqual(deltas,['Привет, ','Пикс!']);
  assert.ok(!deltas.some(text=>text.includes('internal')));
});

test('Browser Cloudflare adapter prefers SSE and gracefully types JSON fallback',async()=>{
  const deltas=[];
  const fetcher=async(url,options)=>{
    assert.equal(options.headers.Accept,'text/event-stream');
    return new Response('{"reply":"Ответ!"}',{headers:{'Content-Type':'application/json'}});
  };
  const reply=await askCloudflare([{role:'user',content:'Тест'}],{
    ownerToken:'only-on-client',fetcher,onDelta:deltas.push.bind(deltas)
  });
  assert.equal(reply,'Ответ!');
  assert.deepEqual(deltas,['Ответ!']);
  await assert.rejects(
    askCloudflare([{role:'user',content:'Test'}],{
      ownerToken:'secret',fetcher:async()=>{ throw new DOMException('The operation was aborted.','AbortError'); }
    }),
    error=>error.name==='AbortError'
  );
});

test('Chat interface includes large layout, waiting animation, stop, expand and opt-in sound',()=>{
  const css=read('styles/pix.css'), js=read('src/pix-guide.js');
  for(const name of ['pix-composer','pix-chat-dock','pix-message-avatar','pix-thinking','pix-spinner','pix-typing-dots','pix-chat-log']){
    assert.ok(css.includes('.'+name),name);
  }
  for(const id of ['pix-sound','pix-expand','pix-stop','pix-thinking','pix-chat-question']){
    assert.ok(js.includes('id="'+id+'"'),id);
  }
  assert.ok(js.includes("activeRequest?.abort()"));
  assert.ok(js.includes('requestAnimationFrame'));
  assert.ok(js.includes('textContent = target.slice'));
  assert.ok(js.includes("playSound('done')"));
  assert.ok(js.includes("aria-pressed=\"false\""));
});
