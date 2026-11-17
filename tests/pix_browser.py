"""Pix AI-only chat: real UI, mocked model/Turnstile, no actual inference.
Set PIX_OFFLINE=1 only in navigation-blocked environments. That mode inlines
local modules/assets; native navigation and CORS are not claimed by it.
"""
from pathlib import Path
from urllib.parse import urlparse, unquote
import os, mimetypes
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
BASE='https://aga.test/Teacher-/'
OFFLINE=os.environ.get('PIX_OFFLINE')=='1'
OUT=Path(os.environ.get('PIX_CHECKS_OUT',str(ROOT.parent/'pix-checks')));OUT.mkdir(exist_ok=True)
PAGES=['','courses/','courses/start/','lessons/first-discovery/','math/','workshop/','library/','library/check-ai/','faq/']
MOCK=r"""() => {
 window.__ai = {configCalls:0,challengeCalls:0,chatCalls:0,requests:[],mode:'stream',configReady:true};
 let options;
 window.turnstile={
  render(node,opts){options=opts;window.__ai.challengeCalls++;setTimeout(()=>opts.callback('test-challenge'),10);return 'test-widget';},
  reset(){window.__ai.challengeCalls++;setTimeout(()=>options.callback('new-challenge'),10);}
 };
 window.fetch=async(url,init={})=>{
  const state=window.__ai;
  if(String(url).endsWith('/config')){state.configCalls++;return new Response(JSON.stringify({publicEnabled:state.configReady,sitekey:'public-test-sitekey'}),{headers:{'Content-Type':'application/json'}});}
  if(!String(url).endsWith('/chat'))throw new Error('Unexpected network URL');
  state.chatCalls++;state.requests.push({body:JSON.parse(init.body),headers:init.headers});
  if(state.mode==='error')return new Response('{}',{status:503});
  if(state.mode==='hold')return new Promise((resolve,reject)=>{init.signal.addEventListener('abort',()=>reject(new DOMException('Stopped','AbortError')),{once:true});});
  if(state.mode==='json')return new Response(JSON.stringify({reply:'Второй ответ без потока.'}),{headers:{'Content-Type':'application/json'}});
  if(state.mode==='long')return new Response(JSON.stringify({reply:'Проверяем постепенный вывод. '.repeat(120)}),{headers:{'Content-Type':'application/json'}});
  const encoder=new TextEncoder();let timer,controller;
  const chunks=[{choices:[{delta:{reasoning_content:'DO_NOT_RENDER'}}]}, {choices:[{delta:{content:'<img src=x onerror=alert(1)> '}}]}, {choices:[{delta:{content:'Я рядом. Давай разберёмся вместе!'}}]}];
  const stream=new ReadableStream({start(c){controller=c;let i=0;timer=setInterval(()=>{if(i<chunks.length)c.enqueue(encoder.encode('data: '+JSON.stringify(chunks[i++])+'\n\n'));else{clearInterval(timer);c.enqueue(encoder.encode('data: [DONE]\n\n'));c.close();}},130);},cancel(){clearInterval(timer);}});
  init.signal.addEventListener('abort',()=>{clearInterval(timer);try{controller.error(new DOMException('Stopped','AbortError'));}catch{}},{once:true});
  return new Response(stream,{headers:{'Content-Type':'text/event-stream'}});
 };
}"""
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce')
 missing=[];external=[]
 def serve(route):
  u=urlparse(route.request.url)
  if u.netloc!='aga.test':
   if 'workers.dev' in u.netloc or 'challenges.cloudflare.com' in u.netloc:external.append(route.request.url)
   route.fulfill(status=204);return
  path=(ROOT/unquote(u.path.removeprefix('/Teacher-/'))).resolve()
  if path.is_dir():path=path/'index.html'
  if ROOT not in path.parents or not path.is_file():missing.append(str(path));route.fulfill(status=404);return
  route.fulfill(status=200,body=path.read_bytes(),content_type=mimetypes.guess_type(str(path))[0] or 'text/plain')
 context.route('**/*',serve)
 errors=[]
 def load(route='',width=1440,height=1000):
  page=context.new_page();page.set_viewport_size({'width':width,'height':height});page.on('pageerror',lambda e:errors.append(str(e)))
  if OFFLINE:
   from pix_harness import document
   page.set_content(document(route+'index.html'),wait_until='domcontentloaded')
  else:page.goto(BASE+route,wait_until='networkidle')
  page.locator('.pix-launcher').wait_for();page.evaluate(MOCK);return page
 # Every route has one closed chat with a local welcome and a real footer asset.
 for route in PAGES:
  page=load(route)
  assert page.locator('#pix-guide').count()==1,route
  assert page.locator('#pix-panel').is_hidden(),route
  assert page.locator('#pix-guide').get_attribute('data-state')=='hello',route
  assert page.locator('#pix-unread').is_visible(),route
  assert 'Dota 2' in page.locator('#pix-chat-log').text_content(),route
  assert page.evaluate('window.__ai.chatCalls')==0
  page.locator('.footer-invite').scroll_into_view_if_needed()
  page.wait_for_timeout(40)
  assert page.locator('.footer-invite').evaluate("el=>parseFloat(getComputedStyle(el,'::after').width)>100")
  page.close()
 assert not external,external
 page=load();page.screenshot(path=str(OUT/'welcome-desktop.png'))
 page.locator('.pix-launcher').click()
 assert page.locator('#pix-chat-question').is_visible()
 assert page.locator('#pix-unread').is_hidden()
 for selector in ['.pix-mode-switch','.pix-presence','.pix-model-chip','#pix-owner-entry']:
  assert page.locator(selector).count()==0,selector
 assert 'Gemma' not in page.locator('#pix-panel').inner_text()
 assert page.locator('#pix-sound').get_attribute('aria-pressed')=='true'
 assert page.evaluate('window.__ai.configCalls')==0
 page.locator('#pix-sound').click();assert page.locator('#pix-sound').get_attribute('aria-pressed')=='false'
 page.locator('#pix-sound').click();assert page.locator('#pix-sound').get_attribute('aria-pressed')=='true'
 page.screenshot(path=str(OUT/'chat-desktop.png'))
 # Expansion and restore.
 old=page.locator('#pix-panel').bounding_box();page.locator('#pix-expand').click()
 assert page.locator('#pix-panel').bounding_box()['width']>=750
 page.screenshot(path=str(OUT/'chat-expanded.png'))
 page.locator('#pix-expand').click()
 assert abs(page.locator('#pix-panel').bounding_box()['width']-old['width'])<1
 # Pointer capture, clamp and keyboard movement.
 handle=page.locator('#pix-drag-handle').bounding_box()
 page.mouse.move(handle['x']+170,handle['y']+60);page.mouse.down();page.mouse.move(handle['x']-50,handle['y']+110,steps=10);page.mouse.up()
 moved=page.locator('#pix-panel').bounding_box()
 assert moved['x']<old['x']-180
 page.locator('#pix-drag-handle').focus();page.keyboard.press('ArrowRight')
 assert abs(page.locator('#pix-panel').bounding_box()['x']-moved['x']-20)<2
 handle=page.locator('#pix-drag-handle').bounding_box()
 page.mouse.move(handle['x']+150,handle['y']+60);page.mouse.down();page.mouse.move(-900,-900,steps=5);page.mouse.up()
 edge=page.locator('#pix-panel').bounding_box();assert edge['x']>=9 and edge['y']>=9
 page.keyboard.press('Escape');assert page.locator('#pix-panel').is_hidden()
 assert page.locator('.pix-launcher').evaluate('(el)=>el===document.activeElement')
 page.locator('.pix-launcher').click()
 page.evaluate("window.__poseHistory=[];new MutationObserver(()=>window.__poseHistory.push(document.querySelector('#pix-guide').dataset.state)).observe(document.querySelector('#pix-guide'),{attributes:true,attributeFilter:['data-state']})")
 # First send is the only point where configuration and challenge are requested.
 page.locator('#pix-chat-question').fill('Привет, как дела?');page.locator('#pix-send').click()
 page.locator('#pix-thinking').wait_for(state='visible')
 assert page.locator('#pix-guide').get_attribute('data-state')=='thinking'
 page.locator('.pix-close').click()
 page.wait_for_function("!document.querySelector('#pix-send').disabled")
 assert page.locator('#pix-unread').is_visible()
 assert page.locator('#pix-unread b').text_content()=='1'
 assert page.locator('#pix-guide').get_attribute('data-state')=='unread'
 assert 'Я рядом' in page.locator('#pix-chat-log').text_content()
 assert 'typing' in page.evaluate('window.__poseHistory')
 assert 'DO_NOT_RENDER' not in page.locator('#pix-chat-log').text_content()
 assert page.locator('.pix-bubble img').count()==0
 request=page.evaluate('window.__ai.requests[0]')
 assert request['body']['messages']==[{'role':'user','content':'Привет, как дела?'}]
 assert request['body']['turnstileToken']=='test-challenge'
 assert 'Authorization' not in request['headers']
 page.locator('.pix-launcher').click();assert page.locator('#pix-unread').is_hidden()
 assert page.locator('#pix-chat-status').is_hidden()
 page.evaluate("window.__ai.mode='json'")
 page.locator('#pix-chat-question').fill('Второй вопрос');page.locator('#pix-send').click()
 page.wait_for_function("!document.querySelector('#pix-send').disabled")
 assert 'Второй ответ' in page.locator('#pix-chat-log').text_content()
 assert len(page.evaluate('window.__ai.requests[1].body.messages'))==3
 # Abort while waiting restores the draft and does not pollute history.
 page.evaluate("window.__ai.mode='hold'")
 page.locator('#pix-chat-question').fill('Отменяем этот вопрос');page.locator('#pix-send').click()
 page.wait_for_function('window.__ai.chatCalls===3');page.locator('#pix-stop').click()
 page.wait_for_function("!document.querySelector('#pix-send').disabled")
 assert page.locator('#pix-chat-question').input_value()=='Отменяем этот вопрос'
 assert 'остановлен' in page.locator('#pix-chat-status').inner_text()
 page.evaluate("window.__ai.mode='error'");page.locator('#pix-send').click()
 page.wait_for_function("!document.querySelector('#pix-send').disabled")
 assert 'временный сбой' in page.locator('#pix-chat-log').inner_text()
 assert page.locator('#pix-guide').get_attribute('data-state')=='error'
 assert page.locator('#pix-chat-question').input_value()=='Отменяем этот вопрос'
 # Abort during the local typewriter fallback, not just during fetch.
 page.emulate_media(reduced_motion='no-preference');page.evaluate("document.body.classList.remove('still');window.__ai.mode='long'")
 page.locator('#pix-send').click();page.wait_for_function("document.querySelector('#pix-chat-log').textContent.includes('Проверяем')")
 page.locator('#pix-stop').click();page.wait_for_function("!document.querySelector('#pix-send').disabled")
 assert 'остановлен' in page.locator('#pix-chat-status').inner_text()
 page.emulate_media(reduced_motion='reduce');page.locator('#pix-clear-chat').click()
 assert page.locator('.pix-bubble').count()==1
 assert 'чистого листа' in page.locator('#pix-chat-log').inner_text()
 page.locator('.pix-close').click();page.locator('.footer-invite').scroll_into_view_if_needed()
 page.wait_for_timeout(40)
 page.screenshot(path=str(OUT/'footer-desktop.png'));page.close()
 # Mobile / narrow screen / short screen, including all controls and the send button.
 for width,height in [(320,740),(390,844),(768,700),(1440,600)]:
  page=load(width=width,height=height);page.locator('.pix-launcher').click()
  frame=page.locator('#pix-panel').bounding_box()
  assert frame['x']>=0 and frame['y']>=0,(width,frame)
  assert frame['x']+frame['width']<=width+1 and frame['y']+frame['height']<=height+1,(width,frame)
  assert page.locator('#pix-send').is_visible()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  page.locator('#pix-expand').click();frame=page.locator('#pix-panel').bounding_box()
  assert frame['x']>=0 and frame['y']>=0 and frame['x']+frame['width']<=width+1
  page.locator('#pix-expand').click()
  if width in [320,390]:page.screenshot(path=str(OUT/f'chat-{width}.png'))
  page.locator('.pix-close').click();page.locator('.footer-invite').scroll_into_view_if_needed()
  page.wait_for_timeout(40)
  if width==390:page.screenshot(path=str(OUT/'footer-mobile.png'))
  page.close()
 # Configuration failure must never silently make the endpoint public or request a key.
 page=load();page.evaluate('window.__ai.configReady=false');page.locator('.pix-launcher').click()
 page.locator('#pix-chat-question').fill('Не теряй мой вопрос');page.locator('#pix-send').click()
 page.wait_for_function("!document.querySelector('#pix-send').disabled")
 assert page.evaluate('window.__ai.chatCalls')==0
 assert page.locator('#pix-chat-question').input_value()=='Не теряй мой вопрос'
 assert 'не получается получить ответ' in page.locator('#pix-chat-log').inner_text()
 assert not errors,errors
 assert not missing,missing
 browser.close()
 print('PASS: local greeting, AI-only chat, no hidden inference, SSE/JSON, abort during fetch/reveal, retry, unread, sound controls, drag, keyboard, 4 viewports, 9 routes and footer sticker. Mode: '+('offline visual harness' if OFFLINE else 'native documents with mocked AI'))
