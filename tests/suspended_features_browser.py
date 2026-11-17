"""Public release smoke: no Pixie widget/cloud calls, local workshop and accessible dark cards."""
from pathlib import Path
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright
import mimetypes, os, re
ROOT=Path(__file__).resolve().parents[1]
BASE="https://aga.test/Teacher-/"
PAGES=["","courses/","courses/start/","lessons/first-discovery/","math/","workshop/","library/","library/check-ai/","faq/"]
external=[];errors=[]
def serve(route):
    url=urlparse(route.request.url)
    if url.netloc!="aga.test":
        external.append(route.request.url)
        route.fulfill(status=204,body="")
        return
    if not url.path.startswith("/Teacher-/"):
        route.fulfill(status=404);return
    file=(ROOT/unquote(url.path[len("/Teacher-/"):])).resolve()
    if ROOT not in file.parents and file!=ROOT:
        route.fulfill(status=403);return
    if file.is_dir():file=file/"index.html"
    route.fulfill(status=200 if file.is_file() else 404,
        body=file.read_bytes() if file.is_file() else b"",
        content_type=mimetypes.guess_type(str(file))[0] or "text/plain")
def rgb(value):
    return [int(x) for x in re.findall(r"\d+",value)[:3]]
def light(color):
    c=[v/255 for v in color]
    c=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c]
    return sum(x*y for x,y in zip((.2126,.7152,.0722),c))
def ratio(a,b):
    hi,lo=sorted((light(a),light(b)),reverse=True)
    return (hi+.05)/(lo+.05)
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH"),headless=True,args=["--no-sandbox"])
    context=browser.new_context(viewport={"width":1440,"height":900},reduced_motion="reduce")
    context.route("**/*",serve)
    page=context.new_page();page.on("pageerror",lambda e:errors.append(str(e)))
    for theme,expected in (("light","#3C9DD0"),("dark","#FFB782")):
        page.goto(BASE,wait_until="networkidle")
        if page.locator("html").get_attribute("data-theme")!=theme:
            page.locator("[data-theme-toggle]").click()
        for route in PAGES:
            page.goto(BASE+route,wait_until="networkidle")
            assert page.locator("html").get_attribute("data-theme")==theme,(route,theme)
            assert page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()")==expected,(route,theme)
            assert page.locator("#pix-guide").count()==0
            assert page.locator("script[src*='pix-guide']").count()==0
            assert page.evaluate("document.documentElement.scrollWidth<=innerWidth+1"),route
        if theme=="dark":
            page.goto(BASE+"workshop/",wait_until="networkidle")
            card=page.locator(".atlas-steps article").first
            colors=card.evaluate("""e=>({bg:getComputedStyle(e).backgroundColor,
                h:getComputedStyle(e.querySelector('h3')).color,
                p:getComputedStyle(e.querySelector('p')).color})""")
            assert ratio(rgb(colors["bg"]),rgb(colors["h"]))>=7,colors
            assert ratio(rgb(colors["bg"]),rgb(colors["p"]))>=4.5,colors
            page.goto(BASE,wait_until="networkidle")
            for card in page.locator(".direction-card").all():
                colors=card.evaluate("""e=>({bg:getComputedStyle(e).backgroundColor,
                    h:getComputedStyle(e.querySelector('strong')).color,
                    p:getComputedStyle(e.querySelector('span:not(.direction-icon):not(.direction-eyebrow)')).color})""")
                assert ratio(rgb(colors["bg"]),rgb(colors["h"]))>=7,colors
                assert ratio(rgb(colors["bg"]),rgb(colors["p"]))>=4.5,colors
    page.goto(BASE+"workshop/",wait_until="networkidle")
    assert page.locator("#idea-ai").count()==0
    for id,value in (("idea-what","Сайт заказов"),("idea-who","Клиенты"),
                     ("idea-first","Каталог"),("idea-check","Проверить заявку")):
        page.locator("#"+id).fill(value)
    page.locator("#idea-form [type='submit']").click()
    assert "Сайт заказов" in page.locator("#idea-output").inner_text()
    assert not any("pixie-ai" in url or "challenges.cloudflare.com" in url for url in external),external
    assert not errors,errors
    browser.close()
print("PASS: 9 pages x 2 themes, no Pixie, local workshop, dark card contrast.")
