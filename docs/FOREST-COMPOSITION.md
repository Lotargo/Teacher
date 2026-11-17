# Grounded forest cast

The five original character WebP files are unchanged. Desktop sizes were increased, not reduced.

- Left bank: the fox rests on a mossy rock at the tree roots; the larger bear occupies the near ground.
- Right bank: the squirrel stands on a stump; the rabbit jumps in front of it; the hedgehog is nearest to the grass at the bottom.
- Each `forest-spot` contains its character, support, contact shadow and small foreground tufts. The whole spot moves together so parallax cannot separate feet from their support.
- The large grass layer and reading wash render behind the cast. They must not cover the bear/rabbit or wash out their silhouettes again.
- Cast layers use viewport coordinates (`inset: 0`), not the oversized environment frame. Explicit desktop gutters keep larger sprites out of the hero, forms and footer.
- The existing breakpoint is unchanged: at widths <= 1600px the dense animal cast is hidden, not scaled down to tiny stickers. Mobile retains the calm distant forest. Pixie stays disabled.

Run `npm test` and `python tests/forest_composition_browser.py`. The browser regression covers two themes, 1666/1920/2560 desktop widths, a 768px-high desktop viewport, 1440/390 compact layouts, extreme pointer positions, deep scrolling and reduced motion. It enforces a minimum size based on the previous release and attached supports.

Local visual verification used the real HTML/CSS/JS/assets in an offline sandbox renderer because top-level navigation is restricted there. External fonts were replaced by their system fallbacks. Native-document browser checks also run in GitHub Actions before Pages deploys.
