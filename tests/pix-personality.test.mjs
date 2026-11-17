import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.js';

test('Pix personality is server-side, survives a custom prompt and keeps identity as lore',async()=>{
  let instruction;
  const env={PILOT_TOKEN:'test-token',PIXIE_SYSTEM_PROMPT:'Проверочная инструкция',AI:{run:async(_model,params)=>{
    instruction=params.messages[0].content;return {choices:[{message:{content:'Привет!'}}]};
  }}};
  const request=new Request('https://pixie-ai.example.workers.dev/chat',{method:'POST',headers:{Authorization:'Bearer test-token','Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:'Кто ты?'}]})});
  assert.equal((await worker.fetch(request,env)).status,200);
  for(const marker of ['Проверочная инструкция','Нейрослопляндии','VEDRO_AI_V2','Dota 2','ругательства','не утверждение']) assert.ok(instruction.includes(marker),marker);
});
