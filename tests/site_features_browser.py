"""Theme on every page, tab-scoped welcome, workshop handoff and safe failures.
PIX_OFFLINE=1 uses an inline local harness where native navigation is blocked.
CI uses actual HTML document loads with intercepted external AI calls.
"""
from pathlib import Path
from urllib.parse import urlparse,unquote
import os,mimetypes
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
BASE='https://aga.test/Teacher/'
OFFLINE=os.environ.get('PIX_OFFLINE')=='1'
OUT=ROOT.parent/'site-feature-checks';OUT.mkdir(exist_ok=True)
PAGES=['','courses/','courses/start/','lessons/first-discovery/','math/','workshop/','library/','library/check-ai/','faq/']
MOCK=r'''() => {
 window.__sent=[];window.__failure=false;let options;
 window.turnstile={render(node,o){options=o;setTimeout(()=>o.callback('test-token'),5);return 'widget';},reset(){setTimeout(()=>options.callback('next-token'),5);}};
 window.fetch=async(url,init={})=>{
  if(String(url).endsWith('/config'))return new Response(JSON.stringify({publicEnabled:true,sitekey:'test-sitekey'}),{headers:{'Content-Type':'application/json'}});
  if(!String(url).endsWith('/chat'))throw Error('unexpected fetch');
  window.__sent.push(JSON.parse(init.body));
  if(window.__failure)return new Response(JSON.stringify({error:{code:'blocked',message:'PRIVATE Cloudflare error 9999 secret'}}),{status:422});
  const encoder=new TextEncoder();
  return new Response(new ReadableStream({start(c){c.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Цель: сайт мастерской.\\n"}}]}\n\n'));setTimeout(()=>{c.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Проверка: отправить заявку с телефона."}}]}\n\ndata: [DONE]\n\n'));c.close();},100);}}),{headers:{'Content-Type':'text/event-stream'}});
 };
}'''
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1440,'height':1000},color_scheme='light',reduced_motion='reduce')
 errors=[];unexpected=[]
 def serve(route):
  u=urlparse(route.request.url)
  if u.netloc!='aga.test':
   if 'workers.dev' in u.netloc or 'challenges.cloudflare.com' in u.netloc:unexpected.append(route.request.url)
   route.fulfill(status=204);return
  p=(ROOT/unquote(u.path.removeprefix('/Teacher/'))).resolve()
  if p.is_dir():p=p/'index.html'
  route.fulfill(status=200 if p.is_file() else 404,body=p.read_bytes() if p.is_file() else b'',content_type=mimetypes.guess_type(str(p))[0] or 'text/plain')
 context.route('**/*',serve)
 def load(page,route='',storage=None,session=None):
  if OFFLINE:
   from pix_harness import document
   page.set_content(document(route+'index.html',storage=storage,session=session),wait_until='domcontentloaded')
  else:page.goto(BASE+route,wait_until='networkidle')
  page.locator('.pix-launcher').wait_for();page.evaluate(MOCK)
 def watch(page):page.on('pageerror',lambda e:errors.append(str(e)))
 page=context.new_page();watch(page);load(page)
 assert page.locator('#pix-unread').is_visible()
 page.locator('.pix-launcher').click();page.locator('.pix-close').click()
 page.locator('[data-theme-toggle]').click()
 assert page.locator('html').get_attribute('data-theme')=='dark'
 state=page.evaluate('({local:window.__store,session:window.__session})') if OFFLINE else None
 for route in PAGES:
  if OFFLINE:
   page.close();page=context.new_page();watch(page)
   load(page,route,state['local'],state['session'])
  else:load(page,route)
  assert page.locator('html').get_attribute('data-theme')=='dark',route
  assert page.locator('#pix-unread').is_hidden(),route
  assert page.evaluate('getComputedStyle(document.body).backgroundColor')=='rgb(23, 31, 38)',route
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),route
  assert page.evaluate('window.__sent.length')==0
  for selector in ['.home-hero','.faq-hero','.atlas-hero','.atlas-form']:
   if page.locator(selector).count():
    assert page.locator(selector).first.evaluate("el=>{let rgb=getComputedStyle(el).backgroundColor.match(/\\d+/g).slice(0,3).map(Number);return Math.max(...rgb)<140}"), (route,selector)

  if route in ['', 'workshop/', 'library/', 'faq/']:
   page.screenshot(path=str(OUT/((route.strip('/') or 'home')+'-dark.png')))
 # End on workshop; exercise both ordinary local assembly and explicit AI.
 if OFFLINE:
  page.close();page=context.new_page();watch(page);load(page,'workshop/',state['local'],state['session'])
 else:load(page,'workshop/')
 page.locator('#idea-form').scroll_into_view_if_needed()
 values={'idea-what':'Сайт мастерской по ремонту кранов','idea-who':'Клиенты с телефона','idea-first':'Услуги, цены и заявка без регистрации','idea-check':'Отправлю заявку с телефона'}
 for key,value in values.items():page.locator('#'+key).fill(value)
 assert page.evaluate('window.__sent.length')==0
 page.locator('#idea-form [type="submit"]').click()
 assert all(value in page.locator('#idea-output').inner_text() for value in values.values())
 assert page.evaluate('window.__sent.length')==0
 page.locator('#idea-ai').click()
 page.wait_for_function("!document.querySelector('#idea-ai').disabled")
 assert 'Цель: сайт мастерской' in page.locator('#idea-output').inner_text()
 assert page.evaluate('window.__sent.length')==1
 payload=page.evaluate('window.__sent[0]')
 assert all(value in payload['messages'][-1]['content'] for value in values.values())
 assert 'test-token'==payload['turnstileToken']
 assert page.locator('#pix-panel').is_visible()
 for selector in ['#pix-sound','#pix-expand','.pix-close']:
  rect=page.locator(selector).bounding_box();assert rect['width']>=44 and rect['height']>=44,rect
 page.screenshot(path=str(OUT/'workshop-ai-dark.png'))
 page.evaluate('window.__failure=true')
 page.locator('#pix-chat-question').fill('Пример вопроса');page.locator('#pix-send').click()
 page.wait_for_function("!document.querySelector('#pix-send').disabled")
 text=page.locator('#pix-chat-log').inner_text()
 assert 'ограничение безопасности' in text
 for word in ['PRIVATE','Cloudflare','9999','secret']:assert word not in text,word
 assert page.locator('#pix-chat-question').input_value()=='Пример вопроса'
 page.locator('.pix-close').click()
 # Four widths in both themes, no overflow or hidden/overlapping controls.
 for width in [320,390,768,1440]:
  for theme in ['light','dark']:
   mobile=context.new_page()
   mobile.set_viewport_size({'width':width,'height':900});watch(mobile)
   if OFFLINE:load(mobile,'library/',{'aga-theme':theme},state['session'])
   else:
    load(mobile,'library/')
    if mobile.locator('html').get_attribute('data-theme')!=theme:
     if width<=900:mobile.locator('.menu-toggle').click()
     mobile.locator('[data-theme-toggle]').click()
     if width<=900:mobile.locator('.menu-toggle').click()
   assert mobile.locator('html').get_attribute('data-theme')==theme
   assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,theme)
   if width in [390,1440]:mobile.screenshot(path=str(OUT/f'library-{theme}-{width}.png'))
   mobile.locator('.pix-launcher').click()
   box=mobile.locator('#pix-panel').bounding_box()
   assert box['x']>=0 and box['y']>=0 and box['x']+box['width']<=width+1
   rects=[mobile.locator(s).bounding_box() for s in ['#pix-sound','#pix-expand','.pix-close']]
   for rect in rects:assert rect['width']>=44 and rect['x']+rect['width']<=box['x']+box['width']
   for left,right in zip(rects,rects[1:]):assert left['x']+left['width']<=right['x']+1
   if width in [390,1440]:mobile.screenshot(path=str(OUT/f'chat-{theme}-{width}.png'))
   mobile.close()
 assert not unexpected,unexpected
 assert not errors,errors
 browser.close()
 print('PASS: global theme/9 routes, welcome once per tab, 44px controls, explicit workshop streaming, safe blocked reply, 4 viewport widths. Mode: '+('inline harness with transferred storage' if OFFLINE else 'native navigation'))
