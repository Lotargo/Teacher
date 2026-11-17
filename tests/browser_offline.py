"""Offline rendering fallback for sandboxes that block all page navigation.
This test explicitly inlines modules/assets and mocks optional localStorage.
It does NOT substitute for browser_smoke.py's real-document navigation checks.
"""
from pathlib import Path
import re,base64
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT.parent/'aga-multipage-previews';OUT.mkdir(exist_ok=True)
PAGES=['index.html','courses/index.html','courses/start/index.html','lessons/first-discovery/index.html']
setup="""window.__store=window.__store||{};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem(k){return window.__store[k]??null},setItem(k,v){window.__store[k]=v}}});"""
def document(path):
    html=(ROOT/path).read_text()
    html=re.sub(r'<link[^>]+>', '', html)
    html=re.sub(r'<script[^>]+src=[^>]+></script>', '', html)
    html=html.replace('</head>','<style>'+ (ROOT/'styles/lesson.css').read_text()+(ROOT/'styles/portal.css').read_text()+'</style></head>')
    names=['lesson-data.js','interpreter.js','grading.js','lesson-app.js'] if path.startswith('lessons/') else ['lesson-data.js','catalog.js','portal.js']
    modules=[]
    for name in names:
        code=(ROOT/'src'/name).read_text()
        code=re.sub(r'^import .*;\n','',code,flags=re.M)
        code=re.sub(r'^export ','',code,flags=re.M)
        if name=='portal.js':
            code=code.replace("new URL('../', import.meta.url)","new URL('https://aga.test/Teacher-/')")
            # Only automatic legacy-anchor navigation is disabled in this offline test.
            code=code.replace("location.replace(url(introLesson.href + location.hash));",'/* Covered by real navigation test. */')
            for asset,mime in [('pix.webp','image/webp'),('mark.svg','image/svg+xml')]:
                data='data:'+mime+';base64,'+base64.b64encode((ROOT/'assets'/asset).read_bytes()).decode()
                code=code.replace("url('assets/"+asset+"')",repr(data))
        modules.append(code)
    html=html.replace('</body>','<script>'+setup+'</script><script type="module">'+'\n'.join(modules)+'</script></body>')
    for name,mime in [('pix.webp','image/webp'),('mark.svg','image/svg+xml')]:
        data='data:'+mime+';base64,'+base64.b64encode((ROOT/'assets'/name).read_bytes()).decode()
        html=re.sub(r'(?:\.\./|\./)*assets/'+re.escape(name),data,html)
    return html
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce')
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    def load(path):
        page.set_content(document(path),wait_until='load')
        page.wait_for_timeout(80)
    for width in [320,390,768,1024,1440]:
        page.set_viewport_size({'width':width,'height':1000})
        for path in PAGES:
            load(path)
            assert page.locator('h1').count()==1
            if width>=768 and path=='courses/index.html':
                assert page.locator('.path-ready').bounding_box()['y']==page.locator('.path-planned').bounding_box()['y']
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),(width,path)
            if width in [390,1440]:
                name=path.replace('/index.html','').replace('index.html','home').replace('/','-')
                page.screenshot(path=str(OUT/f'{name}-{width}.png'),full_page=not path.startswith('lessons/'))
    assert not errors,errors
    load('lessons/first-discovery/index.html')
    for task,section,wrong,right in [('add','math','5','8'),('undo','backward','8','5')]:
        page.locator('#answer-'+task).fill(wrong);page.locator('#'+section+' form button[type="submit"]').click()
        assert page.locator('#'+section+' .result').is_hidden()
        for _ in range(3):page.locator('#'+section+' .hint-button').click()
        assert page.locator('#'+section+' .hint-button').is_disabled()
        page.locator('#answer-'+task).fill(right);page.locator('#'+section+' form button[type="submit"]').click()
        assert page.locator('#'+section+' .result').is_visible()
    page.locator('#language [data-choice="0"]').click()
    for task,solution in [('show','print(8)'),('add-code','print(5+3)'),('undo-code','print(8-3)')]:
        page.locator('[data-code="'+task+'"]').click()
        if task=='add-code':
            page.locator('#code-editor').fill('print(8) #5+3');page.locator('#run-code').click()
            assert page.locator('#code-result').is_hidden()
        page.locator('#code-editor').fill(solution);page.locator('#code-editor').press('Control+Enter')
        assert page.locator('#code-result').is_visible()
    page.locator('#code-editor').focus();page.keyboard.press('Tab')
    assert page.locator('#run-code').evaluate('(n)=>n===document.activeElement')
    page.locator('#answer-transfer').fill('6');page.locator('#transfer input[value="-"]').check()
    page.locator('#transfer form button[type="submit"]').click()
    assert page.locator('#progress-label').inner_text()=='7 из 7 открытий'
    load('courses/start/index.html')
    assert 'Пройдено' in page.locator('.lesson-copy').inner_text()
    load('index.html')
    assert page.locator('[data-started]').is_visible()
    assert page.locator('[data-progress-text]').inner_text()=='Знакомство пройдено. Можно повторить.'
    page.evaluate("window.__store['aga-connected-story-v2']='{oops'")
    load('courses/start/index.html')
    assert page.locator('.lesson-row > a').inner_text().startswith('Начать')
    assert not errors,errors
    print('PASS: offline renders at 5 widths, seven exercises, keyboard, hints, catalog progress with mock storage. Native navigation is tested separately in CI.')
    browser.close()
