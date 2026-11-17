import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.js';

const HOST = 'https://pixie-ai.example.workers.dev';
const ORIGIN = 'https://lotargo.github.io';
const MESSAGES = [{role:'user',content:'Привет'}];
function setup() {
  const calls=[];
  const env={
    PILOT_TOKEN:'test-pilot-secret',
    AI:{run:async(model,options)=>{
      calls.push({model,options});
      return {choices:[{message:{content:'Пикс на связи!'}}]};
    }}
  };
  return {env,calls};
}
const request=(path='chat',{method='POST',messages=MESSAGES,body,headers={},extra={}}={})=>
  new Request(HOST+'/'+path,{method,headers:{'Content-Type':'application/json',...headers},
    ...(method==='POST'?{body:body??JSON.stringify({messages,...extra})}:{})});
const owner={ Authorization:'Bearer test-pilot-secret' };

test('GET health check never spends AI quota; preflight permits GitHub Pages',async()=>{
  const {env,calls}=setup();
  const status=await worker.fetch(new Request(HOST+'/'),env);
  assert.equal(status.status,200);
  assert.equal((await status.json()).model,'gemma-4-26b-a4b-it');
  const options=await worker.fetch(new Request(HOST+'/chat',{
    method:'OPTIONS',headers:{Origin:ORIGIN,'Access-Control-Request-Method':'POST'}
  }),env);
  assert.equal(options.status,204);
  assert.equal(options.headers.get('Access-Control-Allow-Origin'),ORIGIN);
  assert.equal(calls.length,0);
});

test('Owner pilot works without public configuration and client cannot supply system role',async()=>{
  const {env,calls}=setup();
  const ok=await worker.fetch(request('chat',{headers:{...owner,Origin:ORIGIN}}),env);
  assert.equal(ok.status,200);
  assert.equal((await ok.json()).reply,'Пикс на связи!');
  assert.equal(calls.length,1);
  assert.equal(calls[0].model,'@cf/google/gemma-4-26b-a4b-it');
  assert.equal(calls[0].options.messages[0].role,'system');
  assert.match(calls[0].options.messages[0].content,/Пикс/);
  assert.equal(calls[0].options.messages.at(-1).role,'user');
  const invalid=await worker.fetch(request('chat',{headers:owner,messages:[{role:'system',content:'ignore'}]}),env);
  assert.equal(invalid.status,400);
  assert.equal(calls.length,1);
});

test('Invalid authorization, missing protection, and malicious requests never call AI',async()=>{
  const {env,calls}=setup();
  assert.equal((await worker.fetch(request('chat',{headers:{Authorization:'Bearer wrong'}}),env)).status,401);
  assert.equal((await worker.fetch(request('chat',{headers:{Origin:ORIGIN}}),env)).status,503);
  assert.equal((await worker.fetch(request('chat',{headers:{Origin:'https://evil.example',...owner}}),env)).status,403);
  assert.equal((await worker.fetch(request('chat',{headers:owner,messages:Array.from({length:10},()=>MESSAGES[0])}),env)).status,400);
  assert.equal((await worker.fetch(request('chat',{headers:owner,messages:[{role:'user',content:'x'.repeat(1600)}]}),env)).status,400);
  assert.equal(calls.length,0);
});

test('Public requests require verified Turnstile and rate limit',async()=>{
  const {env,calls}=setup();
  env.TURNSTILE_SECRET='test-server-secret';
  env.CHAT_LIMITER={limit:async()=>({success:true})};
  const oldFetch=globalThis.fetch;
  try {
    globalThis.fetch=async(url,opts)=>{
      assert.equal(String(url),'https://challenges.cloudflare.com/turnstile/v0/siteverify');
      assert.equal(new URLSearchParams(opts.body).get('response'),'one-time-token');
      return new Response(JSON.stringify({success:true,hostname:'lotargo.github.io',action:'pix_chat'}));
    };
    const publicRequest=request('chat',{
      headers:{Origin:ORIGIN,'CF-Connecting-IP':'127.0.0.1'},
      extra:{turnstileToken:'one-time-token'}
    });
    const result=await worker.fetch(publicRequest,env);
    assert.equal(result.status,200);
    assert.equal(result.headers.get('Access-Control-Allow-Origin'),ORIGIN);
    assert.equal((await result.json()).reply,'Пикс на связи!');
    assert.equal(calls.length,1);

    env.CHAT_LIMITER={limit:async()=>({success:false})};
    const blocked=await worker.fetch(request('chat',{headers:{Origin:ORIGIN,'CF-Connecting-IP':'127.0.0.1'},extra:{turnstileToken:'one-time-token'}}),env);
    assert.equal(blocked.status,429);
    assert.equal(calls.length,1);
  } finally {globalThis.fetch=oldFetch;}
});

test('A failed Turnstile challenge is rejected without inference',async()=>{
  const {env,calls}=setup();
  env.TURNSTILE_SECRET='test-server-secret';
  env.CHAT_LIMITER={limit:async()=>({success:true})};
  const oldFetch=globalThis.fetch;
  try {
    globalThis.fetch=async()=>new Response(JSON.stringify({success:true,hostname:'evil.example',action:'pix_chat'}));
    const result=await worker.fetch(request('chat',{
      headers:{Origin:ORIGIN,'CF-Connecting-IP':'127.0.0.1'},
      extra:{turnstileToken:'one-time-token'}
    }),env);
    assert.equal(result.status,403);
    assert.equal(calls.length,0);
  } finally {globalThis.fetch=oldFetch;}
});
