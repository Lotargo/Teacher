"""Real multi-document navigation on an intercepted test origin, under /Teacher-/.
No HTML inlining, module rewriting, or mock localStorage. External fonts are
blocked in this test; the site's system-font fallback is deliberately exercised.
Requires Python Playwright and its Chromium build (not site dependencies).
"""
from pathlib import Path
from urllib.parse import urlparse, unquote
import mimetypes, os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT.parent/'aga-multipage-previews';OUT.mkdir(exist_ok=True)
BASE='https://aga.test/Teacher-/'
PAGES=['','courses/','courses/start/','lessons/first-discovery/']
missing=[]
def serve(route):
    u=urlparse(route.request.url)
    if u.netloc!='aga.test':
        route.fulfill(status=204,body='');return
    if not u.path.startswith('/Teacher-/'):
        missing.append(u.path);route.fulfill(status=404,body='Outside project');return
    rel=unquote(u.path[len('/Teacher-/'):]);p=(ROOT/rel).resolve()
    if ROOT not in p.parents and p!=ROOT:
        route.fulfill(status=403);return
    if p.is_dir():p=p/'index.html'
    if not p.is_file():
        missing.append(u.path);route.fulfill(status=404,body='Missing');return
    route.fulfill(status=200,body=p.read_bytes(),content_type=mimetypes.guess_type(str(p))[0] or 'application/octet-stream')

with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce')
    context.route('**/*',serve)
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    def go(path=''):
        page.goto(BASE+path,wait_until='networkidle')
    def follow(locator):
        locator.click()
        page.wait_for_load_state('networkidle')
    go();assert page.locator('h1').count()==1
    page.screenshot(path=str(OUT/'home-desktop.png'),full_page=True)
    follow(page.get_by_role('link',name='Выбрать свой первый шаг'))
    assert page.url==BASE+'courses/'
    page.locator('.path-ready').wait_for(state='visible')
    page.locator('.path-planned').wait_for(state='visible')
    assert page.locator('.path-planned a').count()==0
    assert page.locator('.path-ready').bounding_box()['y']==page.locator('.path-planned').bounding_box()['y']
    page.screenshot(path=str(OUT/'catalog-desktop.png'),full_page=True)
    follow(page.locator('.path-ready a'))
    assert page.url==BASE+'courses/start/'
    assert page.locator('.lesson-row').count()==1
    page.screenshot(path=str(OUT/'course-desktop.png'),full_page=True)
    follow(page.locator('.lesson-row > a'))
    assert page.url==BASE+'lessons/first-discovery/'
    assert page.locator('#answer-add').count()==1
    page.locator('#answer-add').fill('5');page.locator('#math form button[type="submit"]').click()
    assert page.locator('#math .result').is_hidden()
    for _ in range(3):page.locator('#math .hint-button').click()
    assert page.locator('#math .hint-button').is_disabled()
    page.locator('#answer-add').fill('8');page.locator('#math form button[type="submit"]').click()
    assert page.locator('#math .result').is_visible()
    follow(page.locator('.lesson-back'))
    assert page.locator('.lesson-meta').inner_text()=='1 из 7 заданий'
    follow(page.locator('.lesson-row > a'))
    assert page.url.endswith('#backward')
    assert page.locator('#math .result').is_visible()
    page.locator('#answer-undo').fill('5');page.locator('#backward form button[type="submit"]').click()
    page.locator('#language [data-choice="0"]').click()
    follow(page.locator('.lesson-back'));follow(page.locator('.lesson-row > a'))
    assert page.url.endswith('#code')
    for task,solution in [('show','print(8)'),('add-code','print(5+3)'),('undo-code','print(8-3)')]:
        page.locator('[data-code="'+task+'"]').click()
        if task=='add-code':
            page.locator('#code-editor').fill('print(8) #5+3');page.locator('#run-code').click()
            assert page.locator('#code-result').is_hidden()
        if task=='undo-code':
            page.locator('#run-code').click();assert page.locator('#code-output').inner_text()=='11'
        page.locator('#code-editor').fill(solution);page.locator('#code-editor').press('Control+Enter')
        assert page.locator('#code-result').is_visible()
        if task=='show':
            follow(page.locator('.lesson-back'));follow(page.locator('.lesson-row > a'))
            assert page.locator('[data-code="add-code"]').get_attribute('aria-pressed')=='true'
    page.locator('#code-editor').focus();page.keyboard.press('Tab')
    assert page.locator('#run-code').evaluate('(el)=>el===document.activeElement')
    page.locator('#answer-transfer').fill('6');page.locator('#transfer input[value="+"]').check()
    page.locator('#transfer form button[type="submit"]').click();assert page.locator('#transfer .result').is_hidden()
    page.locator('#transfer input[value="-"]').check();page.locator('#transfer form button[type="submit"]').click()
    assert page.locator('#progress-label').inner_text()=='7 из 7 открытий'
    page.reload(wait_until='networkidle');assert page.locator('#progress-label').inner_text()=='7 из 7 открытий'
    follow(page.locator('.lesson-back'));assert 'Пройдено' in page.locator('.lesson-copy').inner_text()
    go();assert page.locator('[data-started]').is_visible()
    assert page.locator('[data-progress-text]').inner_text()=='Знакомство пройдено. Можно повторить.'
    # Direct paths, native history, no horizontal overflow, and all images load.
    for width in [320,390,768,1024,1440]:
        page.set_viewport_size({'width':width,'height':900})
        for path in PAGES:
            go(path)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),f'overflow: {width} {path}'
            assert page.locator('h1').count()==1
            assert page.evaluate('[...document.images].filter(i=>i.loading!=="lazy").every(i=>i.complete&&i.naturalWidth>0)'),path
            if width==390:
                page.screenshot(path=str(OUT/(('home' if not path else path.strip('/').replace('/','-'))+'-mobile.png')),full_page=True)
    go('courses/');follow(page.locator('.path-ready a'));page.go_back(wait_until='networkidle');assert page.url==BASE+'courses/'
    go('#math');page.wait_for_url('**/lessons/first-discovery/#math');assert page.locator('#answer-add').count()==1
    assert not missing,missing
    assert not errors,errors
    # Corrupt or denied storage must never block navigation / tasks.
    page.evaluate("localStorage.setItem('aga-connected-story-v2', '{oops')")
    go('courses/start/');assert page.locator('.lesson-row > a').inner_text().startswith('Начать')
    blocked=browser.new_context(viewport={'width':390,'height':844})
    blocked.route('**/*',serve)
    blocked.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw Error('blocked')}})")
    bp=blocked.new_page();blocked_errors=[];bp.on('pageerror',lambda e:blocked_errors.append(str(e)))
    for path in PAGES:bp.goto(BASE+path,wait_until='networkidle')
    bp.locator('#answer-add').fill('8');bp.locator('#math form button[type="submit"]').click()
    assert bp.locator('#math .result').is_visible();assert not blocked_errors,blocked_errors
    # Static navigation also works with JavaScript disabled.
    plain=browser.new_context(java_script_enabled=False,viewport={'width':390,'height':844})
    plain.route('**/*',serve);np=plain.new_page()
    np.goto(BASE);np.get_by_role('link',name='Выбрать свой первый шаг').click()
    np.locator('.path-ready a').click();np.locator('.lesson-row > a').click()
    assert np.url==BASE+'lessons/first-discovery/'
    assert np.locator('noscript').is_visible()
    print('PASS: four pages, nested paths, seven exercises, native storage/history, resume, mobile layouts, no-JS navigation, reduced motion and blocked storage.')
    browser.close()
