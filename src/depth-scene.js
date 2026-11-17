/** AGA! Paper diorama. Decorative only: no network calls, inputs or user data. */
const FAR = 0.24;
const MID = 0.63;
const NEAR = 1.15;

export const DEPTH_PLANES = Object.freeze({ far: FAR, middle: MID, near: NEAR });

/** Pure math shared with tests. Movement is measured in CSS pixels. */
export function depthOffsets(pointerX, pointerY, scrollY = 0) {
  const x = Math.max(-1, Math.min(1, Number(pointerX) || 0));
  const y = Math.max(-1, Math.min(1, Number(pointerY) || 0));
  const scroll = Math.max(0, Math.min(120, (Number(scrollY) || 0) * 0.075));
  return {
    x: Math.round(x * 22 * 100) / 100,
    y: Math.round(y * 16 * 100) / 100,
    scroll: Math.round(scroll * 100) / 100,
    tiltX: Math.round(y * -2.2 * 100) / 100 || 0,
    tiltY: Math.round(x * 2.8 * 100) / 100,
  };
}

// Each animal travels with its support and contact shadow: no floating feet.
const turf = '<span class="forest-turf"></span>';
const rock = `<svg class="forest-support forest-support-rock" viewBox="0 0 240 75" preserveAspectRatio="none" focusable="false"><path d="M5 65 28 35 64 12 139 8 202 29 236 65Z" fill="#949391" stroke="#514c48" stroke-width="3" stroke-linejoin="round"/><path d="m28 35 72 9 39-36m-39 36 23 24m16-60 24 36 39-15" fill="none" stroke="#68645e" stroke-width="3"/><path d="m33 33 32-21 75-4 41 14-40 1-37 13-42-7Z" fill="#9db276"/></svg>`;
const stump = `<svg class="forest-support forest-support-stump" viewBox="0 0 200 98" preserveAspectRatio="none" focusable="false"><path d="M39 22 29 78 12 91 185 91 165 77 158 22Z" fill="#b87955" stroke="#654531" stroke-width="3" stroke-linejoin="round"/><path d="m52 30-7 49m28-43-2 42m40-43 6 48m23-51 7 46" fill="none" stroke="#885335" stroke-width="4" stroke-linecap="round"/><ellipse cx="98" cy="23" rx="62" ry="18" fill="#e4b987" stroke="#654531" stroke-width="3"/><ellipse cx="98" cy="23" rx="37" ry="10" fill="none" stroke="#bc895d" stroke-width="2"/><path d="m14 90 14-14 7 9 8-12 8 17m100 0 8-15 9 8 7-11 12 18" fill="#728d51" stroke="#4d653d" stroke-width="2" stroke-linejoin="round"/></svg>`;
function forestSpot(name, support = turf) {
  return `<div class="forest-spot forest-spot-${name}" data-forest-character="${name}">
    ${support}<span class="forest-contact-shadow"></span>
    <div class="forest-animal forest-${name}"></div><span class="forest-foot-grass"></span>
  </div>`;
}
const sceneHTML = `
  <div class="aga-depth-layer aga-depth-far" data-depth="far"><div class="forest-landscape"></div></div>
  <div class="aga-depth-layer aga-depth-middle" data-depth="trees"><div class="forest-trees"></div></div>
  <div class="aga-depth-layer aga-depth-foreground" data-depth="foreground"><div class="forest-grass"></div></div>
  <div class="forest-reading-wash"></div>
  <div class="aga-depth-layer aga-depth-animals-back" data-depth="animals-back">
    ${forestSpot('fox', rock)}${forestSpot('squirrel', stump)}
  </div>
  <div class="aga-depth-layer aga-depth-animals-front" data-depth="animals-front">
    ${forestSpot('bear')}${forestSpot('rabbit')}${forestSpot('hedgehog')}
  </div>`;

const heroHTML = `
  <span class="aga-hero-backdrop"></span>
  <span class="aga-hero-ring aga-hero-ring-a"></span>
  <span class="aga-hero-ring aga-hero-ring-b"></span>
  <span class="aga-hero-paper aga-hero-paper-a">✳</span>
  <span class="aga-hero-paper aga-hero-paper-b">+</span>
  <span class="aga-hero-dots"></span>`;

export function mountDepthScene(doc = document, win = window) {
  if (!doc?.body || doc.getElementById('aga-depth-scene')) return null;

  const scene = doc.createElement('div');
  scene.id = 'aga-depth-scene';
  scene.className = 'aga-depth-scene';
  scene.setAttribute('aria-hidden', 'true');
  scene.innerHTML = sceneHTML;
  doc.body.insertBefore(scene, doc.body.firstChild);

  const stage = doc.querySelector('.home-stage');
  if (stage && !stage.querySelector('.aga-hero-planes')) {
    const decorative = doc.createElement('div');
    decorative.className = 'aga-hero-planes';
    decorative.setAttribute('aria-hidden', 'true');
    decorative.innerHTML = heroHTML;
    stage.insertBefore(decorative, stage.firstChild);
  }

  const root = doc.documentElement;
  const finePointer = win.matchMedia('(hover:hover) and (pointer:fine)');
  const reducedMotion = win.matchMedia('(prefers-reduced-motion: reduce)');
  let pointerX = 0, pointerY = 0, raf = 0, disposed = false;
  const enabled = () => !disposed && !doc.hidden && !reducedMotion.matches
    && !doc.body.classList.contains('still') && !doc.body.classList.contains('page-hidden');

  function write() {
    raf = 0;
    const data = enabled() ? depthOffsets(pointerX, pointerY, win.scrollY) : depthOffsets(0, 0, 0);
    root.style.setProperty('--aga-depth-x', data.x + 'px');
    root.style.setProperty('--aga-depth-y', data.y + 'px');
    root.style.setProperty('--aga-depth-scroll', data.scroll + 'px');
    root.style.setProperty('--aga-depth-tilt-x', data.tiltX + 'deg');
    root.style.setProperty('--aga-depth-tilt-y', data.tiltY + 'deg');
    doc.body.classList.toggle('aga-depth-motion', enabled());
  }
  function requestUpdate() {
    if (!raf && !disposed) raf = win.requestAnimationFrame(write);
  }
  function onPointer(event) {
    if (!enabled() || !finePointer.matches) return;
    pointerX = (event.clientX / Math.max(1, win.innerWidth) - .5) * 2;
    pointerY = (event.clientY / Math.max(1, win.innerHeight) - .5) * 2;
    requestUpdate();
  }
  function resetPointer() { pointerX = pointerY = 0; requestUpdate(); }
  const onMotionPreference = () => { if (!finePointer.matches) resetPointer(); requestUpdate(); };
  const observer = new MutationObserver(requestUpdate);
  observer.observe(doc.body, { attributes:true, attributeFilter:['class'] });
  doc.addEventListener('pointermove', onPointer, { passive:true });
  doc.addEventListener('pointerleave', resetPointer, { passive:true });
  win.addEventListener('scroll', requestUpdate, { passive:true });
  win.addEventListener('resize', resetPointer, { passive:true });
  doc.addEventListener('visibilitychange', requestUpdate);
  win.addEventListener('pageshow', requestUpdate);
  finePointer.addEventListener('change', onMotionPreference);
  reducedMotion.addEventListener('change', onMotionPreference);
  requestUpdate();

  return {
    scene,
    dispose() {
      disposed = true;
      if (raf) win.cancelAnimationFrame(raf);
      observer.disconnect();
      doc.removeEventListener('pointermove', onPointer);
      doc.removeEventListener('pointerleave', resetPointer);
      win.removeEventListener('scroll', requestUpdate);
      win.removeEventListener('resize', resetPointer);
      doc.removeEventListener('visibilitychange', requestUpdate);
      win.removeEventListener('pageshow', requestUpdate);
      finePointer.removeEventListener('change', onMotionPreference);
      reducedMotion.removeEventListener('change', onMotionPreference);
      doc.body.classList.remove('aga-depth-motion');
      scene.remove();
    },
  };
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  mountDepthScene();
}
