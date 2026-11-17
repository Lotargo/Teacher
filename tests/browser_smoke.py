"""Real multi-document navigation on an intercepted test origin, under /Teacher-/.
No HTML inlining, module rewriting, or mock localStorage. External fonts are
blocked in this test; the site's system-font fallback is deliberately exercised.
Requires Python Playwright and its Chromium build (not site dependencies).
"""
from pathlib import Path
from urllib.parse import urlparse, unquote
import mimetypes, os
from playwright.sync_api import sync_playwright
from lesson_layout import assert_lesson_layout
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT.parent/'aga-multipage-previews';OUT.mkdir(exist_ok=True)
BASE='https://aga.test/Teacher-/'
PAGES=['','courses/','courses/start/','lessons/first-discovery/','math/','workshop/','library/','library/check-ai/','faq/']
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
    # Shared header/footer, mobile disclosure, native links and keyboard behavior.
    for path in PAGES:
        go(path)
        assert page.locator('.site-header').count()==1
        assert page.locator('.site-footer').count()==1
        footer_box=page.locator('.site-footer').bounding_box()
        brand_box=page.locator('.site-footer .brand').bounding_box()
        assert brand_box['x'] - footer_box['x'] >= 18, 'Footer must retain its inner gutter'
        assert page.locator('.site-header [aria-current]').count()==1
        page.set_viewport_size({'width':390,'height':844})
        assert page.locator('.menu-toggle').is_visible()
        assert not page.locator('.site-menu').is_visible()
        page.locator('.menu-toggle').click()
        assert page.locator('.menu-toggle').get_attribute('aria-expanded')=='true'
        page.locator('.portal-nav a').first.focus();page.keyboard.press('Escape')
        assert not page.locator('.site-menu').is_visible()
        assert page.locator('.menu-toggle').evaluate('(n)=>n===document.activeElement')
        page.locator('.menu-toggle').click()
        follow(page.locator('.portal-nav a').nth(1))
        assert page.url==BASE+'courses/'
        assert page.locator('.menu-toggle').get_attribute('aria-expanded')=='false'
        page.locator('.site-footer').scroll_into_view_if_needed()
        page.locator('.to-top').click()
        page.wait_for_function('scrollY < 5')
        page.set_viewport_size({'width':1440,'height':1000})
        assert page.locator('.site-menu').is_visible()
    go();assert page.locator('h1').count()==1
    # New ways into the lab are real pages with local, working tools.
    assert page.locator('.paths-grid .direction-card').count()==4
    go('math/')
    assert page.locator('#discount-total').is_visible()
    page.locator('#price').fill('1400')
    page.locator('#discount-percent').fill('25')
    assert '1 050' in page.locator('#discount-total').inner_text().replace('\u00a0',' ').replace('\u202f',' ')
    page.locator('#discount-percent').fill('125')
    assert page.locator('#discount-error').is_visible()
    page.locator('#discount-percent').fill('20')
    assert page.locator('#discount-error').is_hidden()
    go('workshop/')
    for id,text in [('idea-what','Сайт для ремонта кранов'),('idea-who','Для клиентов'),('idea-first','Контакты и заявки'),('idea-check','Тестовая заявка приходит')]:
        page.locator('#'+id).fill(text)
    page.locator('#idea-form button[type="submit"]').click()
    assert page.locator('#idea-output-wrap').is_visible()
    assert 'Сайт для ремонта кранов' in page.locator('#idea-output').inner_text()
    go('library/')
    assert page.locator('.resource-card').count()==3
    page.locator('[data-filter="math"]').click()
    assert page.locator('.resource-card:visible').count()==1
    page.locator('[data-filter="all"]').click()
    assert page.locator('.resource-card:visible').count()==3
    assert page.locator('.external-list a[target="_blank"]').count()==4
    go('library/check-ai/')
    assert 'ИИ написал код' in page.locator('h1').inner_text()
    assert page.locator('.article-step').count()==4
    go()

    assert page.locator('.story-card').count()==4
    assert page.locator('.home-team').evaluate('(im)=>im.complete && im.naturalWidth===640')
    for image in page.locator('.story-card img').all():
        image.scroll_into_view_if_needed()
        page.wait_for_function('(im)=>im.complete && im.naturalWidth>0',arg=image.element_handle())
    assert page.locator('[data-motion]').is_disabled()
    assert page.evaluate('document.getAnimations().length')==0
    page.evaluate('scrollTo(0,0)')
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
            if path=='lessons/first-discovery/':
                assert_lesson_layout(page)
            if width==390:
                page.screenshot(path=str(OUT/(('home' if not path else path.strip('/').replace('/','-'))+'-mobile.png')),full_page=True)
    for width,height in [(801,700),(1024,560),(1920,1080),(2200,1000)]:
        page.set_viewport_size({'width':width,'height':height})
        go('lessons/first-discovery/')
        assert_lesson_layout(page)
    page.set_viewport_size({'width':1440,'height':1000})
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
    bp.goto(BASE+'lessons/first-discovery/',wait_until='networkidle')
    bp.locator('#answer-add').fill('8');bp.locator('#math form button[type="submit"]').click()
    assert bp.locator('#math .result').is_visible();assert not blocked_errors,blocked_errors
    # Motion remains optional and is paused off screen; no observer is required to read.
    animated=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='no-preference')
    animated.route('**/*',serve);ap=animated.new_page()
    ap.goto(BASE,wait_until='networkidle')
    ap.locator('.home-stage.in-view').wait_for()
    assert ap.locator('.home-team').evaluate('(im)=>getComputedStyle(im).animationPlayState')=='running'
    ap.locator('[data-motion]').click()
    assert ap.locator('body').evaluate('(el)=>el.classList.contains("still")')
    ap.wait_for_function('document.getAnimations().length===0',timeout=5000)
    ap.reload(wait_until='networkidle')
    assert ap.locator('[data-motion]').get_attribute('aria-pressed')=='false'
    ap.locator('[data-motion]').click()
    ap.locator('.site-footer').scroll_into_view_if_needed()
    ap.wait_for_timeout(200)
    assert ap.locator('.home-team').evaluate('(im)=>getComputedStyle(im).animationPlayState')=='paused'
    ap.goto(BASE+'lessons/first-discovery/',wait_until='networkidle')
    ap.locator('#motion-toggle').click()
    assert ap.locator('[data-motion]').get_attribute('aria-pressed')=='false'
    ap.locator('[data-motion]').click()
    assert ap.locator('#motion-toggle').get_attribute('aria-pressed')=='true'
    ap.goto(BASE,wait_until='networkidle')
    ap.add_init_script('delete window.IntersectionObserver')
    ap.reload(wait_until='networkidle')
    assert ap.locator('.story-card').count()==4
    assert ap.locator('body').evaluate('(el)=>!el.classList.contains("motion-ready")')
    assert ap.evaluate('document.getAnimations().length')==0
    # Static navigation also works with JavaScript disabled.
    plain=browser.new_context(java_script_enabled=False,viewport={'width':390,'height':844})
    plain.route('**/*',serve);np=plain.new_page()
    np.goto(BASE);np.get_by_role('link',name='Выбрать свой первый шаг').click()
    np.locator('.path-ready a').click();np.locator('.lesson-row > a').click()
    assert np.url==BASE+'lessons/first-discovery/'
    assert np.locator('noscript').is_visible()
    print('PASS: shared chrome, mobile menu, footer controls; four pages, nested paths, seven exercises, native storage/history, resume, mobile layouts, no-JS navigation, reduced motion and blocked storage.')
    browser.close()
