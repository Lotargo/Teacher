"""Pix guide E2E: offline first, opt-in Puter SDK with a mocked provider.
No network requests to real AI are made here. This is independent of the public site.
"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote,urlparse
import os,threading
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
    def translate_path(self,path):
        p=unquote(urlparse(path).path)
        if not p.startswith('/Teacher-/'):return str(ROOT/'404')
        return super().translate_path(p[len('/Teacher-'):])
    def log_message(self,*args):pass

SDK="""window.__signInCalls = 0;
window.puter = {
 auth: {isSignedIn: () => false, signIn: () => {window.__signInCalls++;return Promise.resolve({username:'test'});}},
 ai: {chat: async (messages, options) => {
  window.__puterCall = {messages,options};
  return {message:{content:'<img src=x onerror=alert(1)> Ответ Пикс: проверь решение.'}};
 }}
};"""

server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
BASE=f'http://127.0.0.1:{server.server_port}/Teacher-/'
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),headless=True,args=['--no-sandbox'])
  context=browser.new_context(viewport={'width':1440,'height':900},reduced_motion='reduce')
  puter_requests=[]
  def block_external(route):
   if route.request.url.startswith('https://js.puter.com/v2/'):
    puter_requests.append(route.request.url)
    route.fulfill(status=200,content_type='text/javascript',body=SDK)
   elif route.request.url.startswith(BASE):route.continue_()
   else:route.fulfill(status=204)
  context.route('**/*',block_external)
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  for route in ['','courses/','courses/start/','lessons/first-discovery/','math/','workshop/','library/','library/check-ai/','faq/']:
   page.goto(BASE+route,wait_until='networkidle')
   assert page.locator('#pix-guide').count()==1,route
   assert page.locator('.pix-launcher').is_visible(),route
   assert not page.locator('#pix-panel').is_visible(),route
  assert not puter_requests,'Puter must not load without explicit user action'
  page.goto(BASE,wait_until='networkidle')
  page.locator('.pix-launcher').click()
  assert page.locator('#pix-panel').is_visible()
  assert page.locator('#pix-local').is_visible()
  assert 'С чего начать' in page.locator('#pix-chips').inner_text()
  page.locator('#pix-search').fill('Как считать скидку?')
  page.locator('#pix-search-form button').click()
  assert 'сотню' in page.locator('#pix-answer').inner_text()
  assert page.locator('.pix-answer-links a').count()>=1
  assert not puter_requests
  page.locator('[data-pix-mode="ai"]').click()
  assert page.locator('#pix-ai-consent').is_visible()
  assert 'не получает процент' in page.locator('#pix-ai-consent').inner_text()
  assert not puter_requests
  page.locator('#pix-load-puter').click()
  page.locator('#pix-login').wait_for(state='visible')
  assert len(puter_requests)==1
  page.locator('#pix-login').click()
  page.locator('#pix-chat-question').wait_for(state='visible')
  assert page.evaluate('window.__signInCalls')==1
  page.locator('#pix-chat-question').fill('Объясни на бытовом примере')
  page.locator('#pix-chat-question').press('Enter')
  page.locator('.pix-bubble.is-pix').wait_for()
  assert '<img' in page.locator('.pix-bubble.is-pix').inner_text()
  assert page.locator('.pix-bubble img').count()==0,'AI reply must be rendered as text'
  request=page.evaluate('window.__puterCall')
  assert request['messages'][0]['role']=='system'
  assert request['messages'][-1]['role']=='user'
  assert request['options']=={'normalize':True}
  assert not any('Объясни на бытовом примере' in key for key in page.evaluate('Object.keys(localStorage)'))
  page.locator('#pix-clear-chat').click()
  assert page.locator('.pix-bubble').count()==0
  page.locator('[data-pix-mode="local"]').click()
  assert page.locator('#pix-local').is_visible()
  page.keyboard.press('Escape')
  assert not page.locator('#pix-panel').is_visible()
  assert page.locator('.pix-launcher').evaluate('(el)=>el===document.activeElement')
  page.goto(BASE+'faq/',wait_until='networkidle')
  details=page.locator('#puter-questions details')
  assert details.count()>=7
  details.nth(1).locator('summary').click()
  assert details.nth(1).get_attribute('open') is not None
  assert page.locator('a[href="https://docs.puter.com/user-pays-model/"]').count()==1
  page.set_viewport_size({'width':390,'height':700})
  page.locator('.pix-launcher').click()
  frame=page.locator('#pix-panel').bounding_box()
  assert frame['x'] >= 0 and frame['x']+frame['width'] <= 390
  assert frame['y'] >= 0 and frame['y']+frame['height'] <= 700
  assert not errors,errors
  browser.close()
 print('Pix browser smoke: all routes, offline, explicit Puter consent, mock chat and mobile passed')
finally:
 server.shutdown();server.server_close()
