// Shared progressive enhancement. No HTML injection: landmarks are present in every document.
import { introLesson, readLessonProgress } from './catalog.js';
const header = document.querySelector('.site-header');
const toggle = header?.querySelector('.menu-toggle');
const menu = header?.querySelector('.site-menu');
const smallScreen = matchMedia('(max-width: 900px)');
function closeMenu(restoreFocus = false) {
  menu?.classList.remove('is-open');
  toggle?.setAttribute('aria-expanded', 'false');
  if (restoreFocus && smallScreen.matches) toggle?.focus();
}
if (toggle && menu) {
  header.dataset.enhanced = 'true';
  toggle.hidden = false;
  toggle.addEventListener('click', () => {
    const open = menu.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  header.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.classList.contains('is-open')) {
      event.preventDefault(); closeMenu(true);
    }
  });
  menu.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
  document.addEventListener('click', event => { if (!header.contains(event.target)) closeMenu(); });
  smallScreen.addEventListener('change', () => {
    const focused = menu.contains(document.activeElement);
    closeMenu(focused);
  });
}
function measureHeader() {
  if (header) document.documentElement.style.setProperty('--site-header-height', Math.ceil(header.getBoundingClientRect().height) + 'px');
}
measureHeader();
if (header && 'ResizeObserver' in window) new ResizeObserver(measureHeader).observe(header);
else window.addEventListener('resize', measureHeader);
// One persistent motion preference across the catalog, header/footer and lesson.
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let motion = true;
function readMotion() { try { motion = localStorage.getItem('aga-motion') !== 'off'; } catch {} }
readMotion();
const motionButtons = [...document.querySelectorAll('[data-motion], #motion-toggle')];
function applyMotion() {
  const enabled = motion && !reduced.matches;
  document.body.classList.toggle('still', !enabled);
  if (!enabled) document.getAnimations?.().forEach(animation => animation.cancel());
  motionButtons.forEach(button => {
    button.setAttribute('aria-pressed', String(enabled));
    button.disabled = reduced.matches;
    button.textContent = reduced.matches ? 'Движение выключено системой' : enabled ? 'Выключить движение' : 'Включить движение';
  });
}
motionButtons.forEach(button => button.addEventListener('click', () => {
  motion = !motion;
  try { localStorage.setItem('aga-motion', motion ? 'on' : 'off'); } catch {}
  applyMotion();
}));
reduced.addEventListener('change', applyMotion); applyMotion();
function visibility() { document.body.classList.toggle('page-hidden', document.hidden); }
document.addEventListener('visibilitychange', visibility); visibility();
// The lesson also has a footer CTA; the rest of its UI stays independent.
function syncLessonResume() {
  if (!document.body.classList.contains('lesson-page')) return;
  const p = readLessonProgress(introLesson);
  const target = new URL('../' + introLesson.href + p.fragment, import.meta.url).href;
  document.querySelectorAll('[data-resume]').forEach(a => {
    a.href = target;
    a.textContent = (p.complete ? 'Повторить знакомство' : p.count ? 'Продолжить' : 'Попробовать') + ' ↗';
  });
}
syncLessonResume();
window.addEventListener('aga:progress', syncLessonResume);
window.addEventListener('storage', event => {
  if (!event.key || event.key === 'aga-motion') { readMotion(); applyMotion(); }
  if (!event.key || event.key === introLesson.storageKey) syncLessonResume();
});
window.addEventListener('pageshow', () => { closeMenu(); readMotion(); applyMotion(); syncLessonResume(); });
