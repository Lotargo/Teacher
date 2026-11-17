"""Offline-only visual harness for sandboxes blocking browser navigation.
It bundles local ES modules in isolated functions, inlines assets and mocks
fetch/Turnstile. Native documents, CORS and actual provider calls are covered
separately by the standard browser test on the GitHub runner.
"""
from pathlib import Path
import re, json, base64, mimetypes
ROOT=Path(__file__).resolve().parents[1]
BASE='https://aga.test/Teacher-/'

def inline_asset(path):
    mime=mimetypes.guess_type(str(path))[0] or 'application/octet-stream'
    return 'data:'+mime+';base64,'+base64.b64encode(path.read_bytes()).decode()

def document(path='index.html'):
    html=(ROOT/path).read_text()
    html=re.sub(r'<link[^>]+>', '', html)
    html=re.sub(r'<script[^>]+src=[^>]+></script>', '', html)
    styles=[]
    for name in ['lesson','portal','chrome','home','atlas','faq','pix']:
        css=(ROOT/'styles'/f'{name}.css').read_text()
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
        exports=re.findall(r'^export\s+(?:async\s+)?(?:function|const|let)\s+(\w+)',code,flags=re.M)
        code=re.sub(r'^export\s+','',code,flags=re.M)
        order.append('const '+identifier+'=(()=>{'+code+'\nreturn {'+','.join(exports)+'};})();')
        return identifier
    bundle('lesson-app.js' if path.startswith('lessons/') else 'portal.js')
    bundle('pix-guide.js')
    # Storage shim only for the navigation-blocked local visual environment.
    setup="""window.__store={};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>window.__store[k]??null,setItem:(k,v)=>window.__store[k]=String(v)}});"""
    return html.replace('</body>','<script>'+setup+'</script><script>(()=>{'+('\n'.join(order)).replace('</script','<\\/script')+'})();</script></body>')
