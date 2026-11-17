"""Regression checks for the sticky lesson rail at the footer boundary.
Used by both real-document CI and the explicitly offline sandbox renderer.
"""

def assert_lesson_layout(page):
    assert page.locator('.shell > .site-footer').count() == 1, \
        'The footer must stay inside the sticky rail containing block'
    assert page.locator('main .site-footer').count() == 0, \
        'The page footer must remain a landmark outside main'
    width = page.viewport_size['width']
    for fraction in (0, 0.5, 1):
        page.evaluate('''fraction => window.scrollTo({
            top: (document.documentElement.scrollHeight - innerHeight) * fraction,
            behavior: 'instant'
        })''', fraction)
        page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
        boxes = page.evaluate('''() => {
            const rect = s => {
                const r = document.querySelector(s).getBoundingClientRect();
                return {left:r.left, right:r.right, top:r.top, bottom:r.bottom};
            };
            const main = getComputedStyle(document.querySelector('main'));
            return {header:rect('.site-header'), rail:rect('.sidebar'),
                main:rect('main'), footer:rect('.site-footer'),
                padLeft:parseFloat(main.paddingLeft), padRight:parseFloat(main.paddingRight),
                height:innerHeight, width:innerWidth, docWidth:document.documentElement.scrollWidth};
        }''')
        assert boxes['docWidth'] <= boxes['width'], (width, fraction, 'horizontal overflow')
        assert boxes['footer']['top'] >= boxes['main']['bottom'] - 1, \
            (width, fraction, 'footer overlaps lesson content')
        if width > 800:
            assert abs(boxes['rail']['top'] - boxes['header']['bottom']) <= 2, \
                (width, fraction, 'rail slid under header', boxes)
            assert abs(boxes['rail']['bottom'] - boxes['height']) <= 2, \
                (width, fraction, 'rail stopped before viewport bottom', boxes)
            assert boxes['footer']['left'] >= boxes['rail']['right'], \
                (width, fraction, 'footer slipped under rail')
            assert abs(boxes['footer']['left'] - boxes['main']['left'] - boxes['padLeft']) <= 2
            assert abs(boxes['main']['right'] - boxes['padRight'] - boxes['footer']['right']) <= 2
        else:
            assert page.locator('.sidebar').evaluate('(el)=>getComputedStyle(el).position') == 'relative'
            assert boxes['footer']['left'] >= 0 and boxes['footer']['right'] <= width
    page.evaluate("window.scrollTo({top:0,behavior:'instant'})")
