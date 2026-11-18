"""Offline-only visual harness for sandboxes blocking browser navigation.
It bundles local ES modules in isolated functions, inlines assets and mocks
fetch/Turnstile. Native documents, CORS and actual provider calls are covered
separately by the standard browser test on the GitHub runner.
"""
from pathlib import Path
import re, json, base64, mimetypes
ROOT=Path(__file__).resolve().parents[1]
BASE='https://aga.test/Teacher/'

def inline_asset(path):
    mime=mimetypes.guess_type(str(path))[0] or 'application/octet-stream'
    return 'data:'+mime+';base64,'+base64.b64encode(path.read_bytes()).decode()

def document(path='index.html', storage=None, session=None):
    html=(ROOT/path).read_text()
    style_paths = re.findall(r'<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"',html)
    html=re.sub(r'<link[^>]+>', '', html)
    html=re.sub(r'<script[^>]+src=[^>]+></script>', '', html)
    styles=[]
    style_files = [(ROOT/Path(path).parent/href).resolve() for href in style_paths if not href.startswith('https:')]
    style_files = [p for p in style_files if p.name != 'theme.css'] + [ROOT/'styles/pix.css', ROOT/'styles/theme.css']
    for style_file in style_files:
        css=style_file.read_text()
        def css_asset(m):
            p=(ROOT/'styles'/m[1]).resolve()
            return 'url("'+inline_asset(p)+'")' if p.is_file() else m[0]
        css=re.sub(r'url\([\'"]?([^\'"()]+)[\'"]?\)',css_asset,css)
        styles.append(css)
    html=html.replace('</head>','<style>'+''.join(styles)+'</style></head>')
    def img_asset(m):
        prefix=m[1];p=(ROOT/Path(path).parent/m[2]).resolve()
        return prefix+'"'+inline_asset(p)+'"' if p.is_file() else m[0]
    html=re.sub(r'(src=)"([^":]+)"',img_asset,html)
    modules={};order=[]
    def bundle(name):
        if name in modules:return modules[name]
        identifier='module_'+str(len(modules));modules[name]=identifier
        code=(ROOT/'src'/name).read_text(); exports=[]
        code=code.replace('import.meta.url',json.dumps(BASE+'src/'+name))
        def named(m):
            dep=bundle(m[2].removeprefix('./'))
            return 'const {'+m[1]+'} = '+dep+';'
        code=re.sub(r"^import\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]+)['\"];?",named,code,flags=re.M)
        def side(m):return bundle(m[1].removeprefix('./'))+';'
        code=re.sub(r"^import\s*['\"]([^'\"]+)['\"];?",side,code,flags=re.M)
        exports=re.findall(r'^export\s+(?:async\s+)?(?:function|class|const|let)\s+(\w+)',code,flags=re.M)
        code=re.sub(r'^export\s+','',code,flags=re.M)
        order.append('const '+identifier+'=(()=>{'+code+'\nreturn {'+','.join(exports)+'};})();')
        return identifier
    bundle('lesson-app.js' if path.startswith('lessons/') else 'portal.js')
    bundle('pix-guide.js')
    if path.startswith('workshop/'):
        bundle('workshop.js')
    # Storage shim only for the navigation-blocked local visual environment.
    setup='window.__store='+json.dumps(storage or {})+';window.__session='+json.dumps(session or {})+';'
    setup+="""for(const [name,bag] of [['localStorage','__store'],['sessionStorage','__session']])Object.defineProperty(window,name,{configurable:true,value:{getItem:k=>window[bag][k]??null,setItem:(k,v)=>window[bag][k]=String(v),removeItem:k=>delete window[bag][k],clear:()=>window[bag]={}}});"""
    setup += (ROOT/'src/theme-init.js').read_text()
    return html.replace('</body>','<script>'+setup+'</script><script>(()=>{'+('\n'.join(order)).replace('</script','<\\/script')+'})();</script></body>')
