"""Local visual checks for the refreshed FAQ, value stickers and avatar states.
Uses the existing offline harness when PIX_OFFLINE=1; native document mode
is available on unrestricted runners. Provider requests remain mocked.
"""
from pathlib import Path
import os, mimetypes
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright
from pix_harness import document
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('PIX_CHECKS_OUT',str(ROOT.parent/'pix-polish-checks')));OUT.mkdir(exist_ok=True)
OFFLINE=os.environ.get('PIX_OFFLINE')=='1'
BASE='https://aga.test/Teacher-/'
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),headless=True,args=['--no-sandbox'])
 context=browser.new_context(reduced_motion='reduce')
 errors=[]
 def serve(route):
  url=urlparse(route.request.url)
  if url.netloc!='aga.test':route.fulfill(status=204);return
  path=(ROOT/unquote(url.path.removeprefix('/Teacher-/'))).resolve()
  if path.is_dir():path=path/'index.html'
  if ROOT not in path.parents or not path.is_file():route.fulfill(status=404);return
  route.fulfill(status=200,body=path.read_bytes(),content_type=mimetypes.guess_type(str(path))[0] or 'text/plain')
 context.route('**/*',serve)
 def load(file,width,height,clock=False):
  page=context.new_page();page.set_viewport_size({'width':width,'height':height});page.on('pageerror',lambda e:errors.append(str(e)))
  if clock:page.clock.install()
  if OFFLINE:page.set_content(document(file),wait_until='load')
  else:page.goto(BASE+file,wait_until='networkidle')
  return page
 for width,height in [(1440,1000),(768,1000),(390,844),(320,740)]:
  page=load('index.html',width,height)
  page.locator('.value-strip').scroll_into_view_if_needed()
  assert page.locator('.value-chip').count()==4
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),('home overflow',width)
  for item in page.locator('.value-chip').all():
   r=item.bounding_box();assert r['x']>=0 and r['x']+r['width']<=width+1
  page.screenshot(path=str(OUT/f'home-labels-{width}.png'))
  page.close()
  page=load('faq/index.html',width,height)
  assert page.locator('.faq-portrait').evaluate('(el)=>el.complete && el.naturalWidth>0')
  visible=page.locator('main').inner_text()
  for word in ['Cloudflare','Gemma','Turnstile','API-ключ']:assert word not in visible,word
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),('faq overflow',width)
  figure=page.locator('.faq-portrait').bounding_box();hero=page.locator('.faq-hero').bounding_box()
  assert figure['y']>=hero['y'] and figure['y']+figure['height']<=hero['y']+hero['height']+1,(width,figure,hero)
  page.locator('#lab-questions details').first.locator('summary').click()
  assert 'Учиться вместе веселее' in page.locator('#lab-questions details').first.inner_text()
  page.screenshot(path=str(OUT/f'faq-answer-{width}.png'))
  page.evaluate('window.scrollTo(0,0)')
  page.screenshot(path=str(OUT/f'faq-portrait-{width}.png'))
  page.close()
 # Test actual DOM reactions plus clock-controlled idle, without waiting a minute.
 page=load('index.html',1440,1000,clock=True)
 page.emulate_media(reduced_motion='no-preference')
 page.evaluate("document.body.classList.remove('still')")
 page.wait_for_timeout(50)
 assert page.locator('#pix-guide').get_attribute('data-state')=='hello'
 page.clock.fast_forward(8000)
 assert page.locator('#pix-guide').get_attribute('data-state')=='unread'
 page.clock.fast_forward(48000)
 assert page.locator('#pix-guide').get_attribute('data-state')=='idle'
 page.screenshot(path=str(OUT/'pix-idle.png'))
 page.evaluate("document.body.classList.add('still')")
 page.wait_for_timeout(50)
 state=page.locator('#pix-guide').get_attribute('data-expression')
 page.clock.fast_forward(120000)
 assert page.locator('#pix-guide').get_attribute('data-expression')==state
 page.close()
 assert not errors,errors
 browser.close()
 print('PASS: FAQ portrait and disclosure, 4 styled labels, 320/390/768/1440 layouts; real idle/unread avatar transitions and motion switch.')
