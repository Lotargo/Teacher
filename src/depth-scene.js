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

const sceneHTML = `
  <div class="aga-depth-layer aga-depth-far" data-depth="far">
    <i class="aga-depth-halo aga-depth-halo-a"></i><i class="aga-depth-halo aga-depth-halo-b"></i>
    <i class="aga-depth-halo aga-depth-halo-c"></i>
    <i class="aga-depth-wash aga-depth-wash-a"></i><i class="aga-depth-wash aga-depth-wash-b"></i>
  </div>
  <div class="aga-depth-layer aga-depth-middle" data-depth="middle">
    <i class="aga-depth-orbit aga-depth-orbit-a"></i><i class="aga-depth-orbit aga-depth-orbit-b"></i>
    <i class="aga-depth-outline-star aga-depth-star-a"></i>
    <i class="aga-depth-outline-star aga-depth-star-b"></i>
    <i class="aga-depth-asterisk aga-depth-asterisk-a">✳</i>
    <i class="aga-depth-asterisk aga-depth-asterisk-b">✳</i>
    <i class="aga-depth-dot-trail aga-depth-dots-a"></i>
  </div>
  <div class="aga-depth-layer aga-depth-near" data-depth="near">
    <i class="aga-depth-paper aga-depth-paper-a"><b>✦</b></i>
    <i class="aga-depth-paper aga-depth-paper-b"><b>∑</b></i>
    <i class="aga-depth-stroke aga-depth-stroke-a"></i>
    <i class="aga-depth-stroke aga-depth-stroke-b"></i>
    <i class="aga-depth-dot-trail aga-depth-dots-b"></i>
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
