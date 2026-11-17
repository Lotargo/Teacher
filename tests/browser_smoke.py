"""Offline Chromium DOM tests. Inlines unchanged modules and assets in a test page.
Navigation is blocked in the sandbox, so localStorage is mocked explicitly.
Requires Python playwright, Pillow and /usr/bin/chromium; not site dependencies.
"""
from pathlib import Path
import re,base64
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT.parent/'aga-previews';OUT.mkdir(exist_ok=True)
html=(ROOT/'index.html').read_text()
html=re.sub(r'<link[^>]+>', '', html)
html=re.sub(r'<script[^>]+src=[^>]+></script>', '', html)
html=html.replace('</head>','<style>'+ (ROOT/'styles/lesson.css').read_text() +'</style></head>')
for name,mime in [('pix.webp','image/webp'),('mark.svg','image/svg+xml')]:
    html=html.replace('./assets/'+name,'data:'+mime+';base64,'+base64.b64encode((ROOT/'assets'/name).read_bytes()).decode())
modules=[]
for name in ['lesson-data.js','interpreter.js','grading.js','lesson-app.js']:
    code=(ROOT/'src'/name).read_text()
    code=re.sub(r'^import .*;\n','',code,flags=re.M)
    code=re.sub(r'^export ','',code,flags=re.M)
    modules.append(code)
setup="""window.__store=window.__store||{}; Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem(k){return window.__store[k]??null},setItem(k,v){window.__store[k]=v}}});"""
page_html=html.replace('</body>','<script>'+setup+'</script><script type="module">'+'\n'.join(modules)+'</script></body>')
for name,mime in [('pix.webp','image/webp'),('mark.svg','image/svg+xml')]:
    page_html=page_html.replace('./assets/'+name,'data:'+mime+';base64,'+base64.b64encode((ROOT/'assets'/name).read_bytes()).decode())
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=b.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce')
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(page_html,wait_until='load');page.locator('#answer-add').wait_for()
    assert page.locator('#motion-toggle').is_disabled()
    page.screenshot(path=str(OUT/'desktop.png'))
    for task,section,wrong,right in [('add','math','5','8'),('undo','backward','8','5')]:
        page.locator('#answer-'+task).fill(wrong)
        page.locator('#'+section+' form button[type="submit"]').click()
        assert page.locator('#'+section+' .result').is_hidden()
        hint=page.locator('#'+section+' .hint-button')
        for _ in range(3):hint.click()
        assert hint.is_disabled()
        page.locator('#answer-'+task).fill(right);page.locator('#'+section+' form button[type="submit"]').click()
        assert page.locator('#'+section+' .result').is_visible()
    page.locator('#language [data-choice="1"]').click();assert page.locator('#language .result').is_hidden()
    page.locator('#language [data-choice="0"]').click();assert page.locator('#language .result').is_visible()
    for task,solution in [('show','print(8)'),('add-code','print(5+3)'),('undo-code','print(8-3)')]:
        page.locator('[data-code="'+task+'"]').click()
        if task=='add-code':
            page.locator('#code-editor').fill('print(8) #5+3');page.locator('#run-code').click();assert page.locator('#code-result').is_hidden()
        if task=='undo-code':
            page.locator('#run-code').click();assert page.locator('#code-output').inner_text()=='11'
            assert page.locator('#code-result').is_hidden()
        page.locator('#code-editor').fill(solution);page.locator('#code-editor').press('Control+Enter')
        assert page.locator('#code-result').is_visible()
    page.locator('#code-editor').focus();page.keyboard.press('Tab')
    assert page.locator('#run-code').evaluate('(n)=>n===document.activeElement')
    page.locator('#answer-transfer').fill('6');page.locator('#transfer input[value="+"]').check()
    page.locator('#transfer form button[type="submit"]').click();assert page.locator('#transfer .result').is_hidden()
    page.locator('#transfer input[value="-"]').check();page.locator('#transfer form button[type="submit"]').click()
    assert page.locator('#transfer .result').is_visible()
    assert page.locator('#progress-label').inner_text()=='7 из 7 открытий'
    page.locator('#backward').scroll_into_view_if_needed();page.screenshot(path=str(OUT/'lesson-desktop.png'))
    saved=page.evaluate('window.__store');page.set_content(page_html,wait_until='load')
    assert page.locator('#progress-label').inner_text()=='7 из 7 открытий'
    assert page.locator('#backward .result').is_visible()
    for width in [320,390,768,1024,1440]:
        page.set_viewport_size({'width':width,'height':900})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),'overflow '+str(width)
        if width in [320,390]:
            page.evaluate('scrollTo(0,0)');page.screenshot(path=str(OUT/('mobile-'+str(width)+'.png')))
    page.evaluate("window.__store['aga-connected-story-v2']='null'");page.set_content(page_html,wait_until='load')
    assert page.locator('#progress-label').inner_text()=='0 из 7 открытий'
    # A separate page uses real opaque-origin storage (unavailable): learning still works.
    fallback=b.new_page(viewport={'width':390,'height':844})
    fallback.set_content(page_html.replace(setup,''),wait_until='load');fallback.locator('#answer-add').fill('8')
    fallback.locator('#math form button[type="submit"]').click();assert fallback.locator('#math .result').is_visible()
    fallback.locator('#motion-toggle').click();assert fallback.locator('body').evaluate("e=>e.classList.contains('still')")
    assert not errors,errors
    print('PASS: complete lesson, hints, wrong answers, evidence grading, keyboard, mocked storage restore, 5 viewport widths, reduced motion, unavailable storage.')
    b.close()
