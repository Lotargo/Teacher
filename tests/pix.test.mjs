import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { getPageContext, getSuggestions, getLocalAnswer, guessLocalIntent, buildAiMessages, getAiText, PATHS } from '../src/pix-core.js';
import { PUTER_CDN, askPuter, explainPuterAuthError } from '../src/puter-adapter.js';
const root = new URL('../', import.meta.url);
const read = file => readFileSync(new URL(file,root),'utf8');

test('Pix works as a real local guide without Puter or user accounts', () => {
  assert.ok(getSuggestions('lesson').some(a=>a.id==='lesson'));
  assert.match(getLocalAnswer('lesson').text,/Подсказка/);
  assert.equal(guessLocalIntent('Как мне посчитать скидку 15%?'),'math');
  assert.equal(guessLocalIntent('Хочу сделать сайт'), 'idea');
  assert.equal(getPageContext('workshop').route,'workshop');
  assert.equal(getPageContext('unknown').route,'home');
  for(const route of Object.values(PATHS)) assert.ok(route.path && route.label);
});

test('Pix AI instruction contains boundaries; conversation size is capped',()=>{
  const veryLong='x'.repeat(9000);
  const prev=Array.from({length:25},(_,i)=>({role:i%2===0?'user':'assistant',content:veryLong}));
  const messages=buildAiMessages('lesson',prev,veryLong);
  assert.equal(messages.length,10);
  assert.equal(messages[0].role,'system');
  assert.match(messages[0].content,/не выдавай готовый ответ/i);
  assert.match(messages[0].content,/яблоки/);
  assert.ok(messages.slice(1,9).every(m=>m.content.length===2000));
  assert.equal(messages.at(-1).content.length,1200);
});

test('Puter response normalization supports text and content blocks without markup insertion',async()=>{
  assert.equal(getAiText({message:{content:'Привет!'}}),'Привет!');
  assert.equal(getAiText({message:{content:[{type:'text',text:'Ага!'},{type:'image',url:'data:'}]}}),'Ага!');
  assert.throws(()=>getAiText({message:{content:[]}}),/не содержит текста/);
  let called;
  const answer=await askPuter({ai:{chat:async (...args)=>{called=args;return {message:{content:'Готово'}}}}},[{role:'user',content:'Привет'}]);
  assert.equal(answer,'Готово');
  assert.deepEqual(called[1],{normalize:true});
  assert.equal(PUTER_CDN,'https://js.puter.com/v2/');
});

test('Puter auth failures explain signup issue without leaking backend data',()=>{
  assert.match(explainPuterAuthError({error:'signup_failed',msg:'Your account could not be created',debug_token:'secret'}),/Puter не смог создать/);
  assert.match(explainPuterAuthError({error:'popup_blocked'}),/заблокировал окно/);
  assert.match(explainPuterAuthError({error:'auth_window_closed'}),/Окно Puter закрыто/);
  assert.match(explainPuterAuthError({error:'unsupported_origin'}),/адрес страницы/);
  assert.ok(!explainPuterAuthError({msg:'Bearer secret-key'}).includes('secret-key'));
  assert.ok(read('styles/pix.css').includes('.pix-close::before'));
  assert.ok(read('src/pix-guide.js').includes('id="pix-login-help"'));
});

test('Puter is loaded only from the opt-in handler and no secrets are embedded',()=>{
  const js=read('src/pix-guide.js');
  const adapter=read('src/puter-adapter.js');
  assert.ok(js.includes("loadButton.addEventListener('click'"));
  assert.ok(!js.includes('localStorage.setItem'));
  assert.ok(!js.includes('innerHTML = reply'));
  assert.ok(js.includes('body.textContent = text'));
  assert.ok(adapter.includes('script.src = PUTER_CDN'));
  assert.ok(!/sk-[a-zA-Z0-9]{10,}/.test(adapter));
  for (const image of ['assets/pix-guide.webp','styles/pix.css','faq/index.html']) assert.ok(existsSync(new URL(image,root)),image);
});

test('FAQ is reachable and gives clear disclosure',()=>{
  const faq=read('faq/index.html');
  for(const text of ['Бесплат','Puter','плат','процент','приватности','доброволь']){
    assert.ok(faq.toLowerCase().includes(text.toLowerCase()),text);
  }
  assert.ok((faq.match(/<details/g)||[]).length>=8);
  assert.ok(read('templates/header.html').includes('href="{{root}}faq/"'));
  assert.ok(read('templates/footer.html').includes('src/pix-guide.js'));
});
