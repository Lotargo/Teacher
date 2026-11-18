"""Browser regression for cast size, visibility and attached supports.
Run: python tests/forest_composition_browser.py (Playwright Chromium required).
No AI or external services are called; original local documents are routed intact.
"""
from pathlib import Path
from urllib.parse import urlparse, unquote
import mimetypes, os
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://aga.test/Teacher/'
# Rounded-up rendered dimensions of the previous release, not new target sizes.
PREVIOUS = {'bear': (211, 253), 'rabbit': (192, 235),
            'fox': (184, 225), 'squirrel': (179, 233), 'hedgehog': (160, 200)}


def assert_composition(page, width, height):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Horizontal overflow'
    assert page.locator('#pix-guide').count() == 0, 'Pixie must stay suspended'
    actors = page.locator('[data-forest-character]')
    assert actors.count() == 5
    boxes = {}
    for actor in actors.all():
        name = actor.get_attribute('data-forest-character')
        image = actor.locator('.forest-animal')
        if width <= 1600:
            assert not image.is_visible(), name
            continue
        assert image.is_visible(), name
        # Read both rectangles together so parallax cannot move the actor between measurements.
        geometry = actor.evaluate('''actor => {
            const image = actor.querySelector('.forest-animal').getBoundingClientRect();
            const support = actor.querySelector('.forest-support');
            return { image: image.toJSON(), supportTop: support?.getBoundingClientRect().top ?? null };
        }''')
        box = geometry['image']
        boxes[name] = box
        minimum_width, minimum_height = PREVIOUS[name]
        assert box['width'] >= minimum_width and box['height'] >= minimum_height, (name, box)
        assert box['x'] >= 0 and box['x'] + box['width'] <= width, (name, box)
        assert box['y'] >= 80 and box['y'] + box['height'] <= height, (name, box)
        assert actor.locator('.forest-contact-shadow').count() == 1
        if geometry['supportTop'] is not None:
            overlap = box['bottom'] - geometry['supportTop']
            assert 0 <= overlap <= 32, (name, 'feet detached from support', overlap)
        assert float(image.evaluate('e=>getComputedStyle(e).opacity')) >= .94
    if boxes:
        assert boxes['bear']['width'] > boxes['fox']['width'] > boxes['hedgehog']['width']
        hero = page.locator('.home-hero, .atlas-hero').first
        if hero.count():
            content = hero.bounding_box()
            for name, box in boxes.items():
                assert (box['x'] + box['width'] <= content['x'] + 1 or
                        box['x'] >= content['x'] + content['width'] - 1), (name, 'behind content')


def run():
    def serve(route):
        url = urlparse(route.request.url)
        if url.netloc != 'aga.test':
            route.fulfill(status=204, body='')
            return
        path = (ROOT / unquote(url.path.removeprefix('/Teacher/'))).resolve()
        if path.is_dir():
            path /= 'index.html'
        if ROOT not in path.parents or not path.is_file():
            route.fulfill(status=404)
            return
        route.fulfill(status=200, body=path.read_bytes(),
                      content_type=mimetypes.guess_type(str(path))[0] or 'application/octet-stream')

    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),
                                     headless=True, args=['--no-sandbox'])
        for width, height in [(1666, 900), (1920, 1080), (1920, 768), (2560, 1440), (1440, 900), (390, 844)]:
            context = browser.new_context(viewport={'width': width, 'height': height})
            context.route('**/*', serve)
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            for theme in ['light', 'dark']:
                page.goto(BASE, wait_until='networkidle')
                page.evaluate('(theme)=>localStorage.setItem("aga-theme",theme)', theme)
                page.reload(wait_until='networkidle')
                for x, y, scroll in [(1, 1, 0), (width-1, height-1, 1600), (width//2, height//2, 99999)]:
                    page.mouse.move(x, y)
                    page.evaluate('(y)=>scrollTo({top:y,behavior:"instant"})', scroll)
                    page.wait_for_timeout(100)
                    assert_composition(page, width, height)
                page.emulate_media(reduced_motion='reduce')
                page.wait_for_timeout(100)
                assert_composition(page, width, height)
                page.emulate_media(reduced_motion='no-preference')
            assert not errors, errors
            context.close()
        browser.close()
    print('Forest: five visible, non-shrunk, grounded characters; scroll, themes, compact viewports passed.')


if __name__ == '__main__':
    run()
