"""Pix guide E2E: local mode, explicit Cloudflare consent, mocked owner-only chat.
No actual Cloudflare model calls occur.
"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote, urlparse
import os, threading
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(ROOT),**kwargs)
    def translate_path(self,path):
        p=unquote(urlparse(path).path)
        if not p.startswith('/Teacher-/'): return str(ROOT/'404')
        return super().translate_path(p[len('/Teacher-'):])
    def log_message(self,*args): pass

server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
BASE=f'http://127.0.0.1:{server.server_port}/Teacher-/'
ORIGIN=f'http://127.0.0.1:{server.server_port}'
WORKER='https://pixie-ai.etot-mir-realen3.workers.dev/chat'
requests=[]
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),headless=True,args=['--no-sandbox'])
  context=browser.new_context(viewport={'width':1440,'height':900},reduced_motion='reduce')
  def block_external(route):
   req=route.request
   if req.url == WORKER:
    if req.method == 'OPTIONS':
     route.fulfill(status=204,headers={
       'access-control-allow-origin':ORIGIN,'access-control-allow-headers':'authorization, content-type',
       'access-control-allow-methods':'POST, OPTIONS'
     });return
    assert req.method == 'POST'
    requests.append({
      'body':req.post_data_json,
      'authorization':req.headers.get('authorization','')
    })
    route.fulfill(status=200,content_type='application/json',headers={
      'access-control-allow-origin':ORIGIN
    },body='{"reply":"<img src=x onerror=alert(1)> Ответ Пикс: проверь решение."}')
   elif req.url.startswith(BASE): route.continue_()
   else: route.fulfill(status=204)
  context.route('**/*',block_external)
  page=context.new_page();errors=[];page.on('pageerror',lambda error: errors.append(str(error)))
  for route in ['','courses/','courses/start/','lessons/first-discovery/','math/','workshop/','library/','library/check-ai/','faq/']:
   page.goto(BASE+route,wait_until='networkidle')
   assert page.locator('#pix-guide').count()==1,route
   assert page.locator('.pix-launcher').is_visible(),route
   assert not page.locator('#pix-panel').is_visible(),route
  assert not requests,'Model must not load without consent'
  page.goto(BASE,wait_until='networkidle')
  page.locator('.pix-launcher').click()
  assert page.locator('#pix-panel').is_visible()
  assert page.locator('#pix-local').is_visible()
  assert page.locator('#pix-panel').bounding_box()['width']>=500
  page.locator('#pix-expand').click()
  assert page.locator('#pix-expand').get_attribute('aria-pressed')=='true'
  assert page.locator('#pix-panel').bounding_box()['width']>=700
  page.locator('#pix-expand').click()
  assert page.locator('#pix-expand').get_attribute('aria-pressed')=='false'
  assert page.locator('#pix-sound').is_visible()
  assert page.locator('#pix-stop').count()==1
  assert 'С чего начать' in page.locator('#pix-chips').inner_text()
  page.locator('#pix-search').fill('Как считать скидку?')
  page.locator('#pix-search-form button').click()
  assert 'сотню' in page.locator('#pix-answer').inner_text()
  assert page.locator('.pix-answer-links a').count()>=1
  assert not requests
  page.locator('[data-pix-mode="ai"]').click()
  assert page.locator('#pix-ai-consent').is_visible()
  assert 'Cloudflare' in page.locator('#pix-ai-consent').inner_text()
  assert not requests
  page.locator('#pix-connect-cloudflare').click()
  page.wait_for_function("() => document.querySelector('#pix-connect-status')?.textContent.includes('Введи личный')")
  assert page.locator('#pix-owner-entry').get_attribute('open') is not None
  page.locator('#pix-owner-key').fill('test-pilot-secret')
  page.locator('#pix-connect-cloudflare').click()
  page.locator('#pix-chat-question').wait_for(state='visible')
  assert page.locator('#pix-owner-key').input_value()==''
  assert not requests
  page.locator('#pix-chat-question').fill('Объясни на бытовом примере')
  page.locator('#pix-chat-question').press('Enter')
  page.wait_for_function("() => document.querySelector('.pix-bubble.is-pix p')?.textContent.includes('Ответ Пикс: проверь решение.')")
  assert '<img' in page.locator('.pix-bubble.is-pix').inner_text()
  assert page.locator('.pix-bubble img').count()==0,'AI output must be plain text'
  assert len(requests)==1
  assert requests[0]['authorization']=='Bearer test-pilot-secret'
  assert requests[0]['body']['messages'][-1]=={'role':'user','content':'Объясни на бытовом примере'}
  assert 'system' not in [m['role'] for m in requests[0]['body']['messages']]
  assert 'Объясни на бытовом примере' not in str(page.evaluate('Object.keys(localStorage)'))
  page.locator('#pix-clear-chat').click()
  assert page.locator('.pix-bubble').count()==0
  page.locator('[data-pix-mode="local"]').click()
  assert page.locator('#pix-local').is_visible()
  page.keyboard.press('Escape')
  assert not page.locator('#pix-panel').is_visible()
  assert page.locator('.pix-launcher').evaluate('(el)=>el===document.activeElement')
  page.goto(BASE+'faq/',wait_until='networkidle')
  details=page.locator('#ai-questions details')
  assert details.count()>=8
  details.nth(1).locator('summary').click()
  assert details.nth(1).get_attribute('open') is not None
  assert page.locator('a[href="https://www.cloudflare.com/privacypolicy/"]').count()==1
  page.set_viewport_size({'width':390,'height':700})
  page.locator('.pix-launcher').click()
  frame=page.locator('#pix-panel').bounding_box()
  assert frame['x']>=0 and frame['x']+frame['width']<=390
  assert frame['y']>=0 and frame['y']+frame['height']<=700
  assert not errors,errors
  browser.close()
 print('Pix browser smoke: all routes, offline, explicit Cloudflare consent, mocked chat, mobile passed')
finally:
 server.shutdown();server.server_close()
