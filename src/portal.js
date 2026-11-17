import './site-chrome.js';
import { introLesson, learningPaths, readLessonProgress } from './catalog.js';
const root = new URL('../', import.meta.url);
const url = path => new URL(path, root).href;
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lessonCount = n => `${n} ${n % 100 >= 11 && n % 100 <= 14 ? 'занятий' : n % 10 === 1 ? 'занятие' : n % 10 >= 2 && n % 10 <= 4 ? 'занятия' : 'занятий'}`;
const resumeText = p => p.complete ? 'Вернуться к знакомству' : p.count ? 'Продолжить знакомство' : 'Попробовать знакомство';
function renderProgress() {
  const p = readLessonProgress(introLesson);
  $$('[data-resume]').forEach(a => { a.href = url(introLesson.href + p.fragment); a.textContent = (a.hasAttribute('data-resume-compact') ? (p.complete ? 'Повторить знакомство' : p.count ? 'Продолжить' : 'Попробовать') : resumeText(p)) + ' ↗'; });
  $$('[data-progress-text]').forEach(node => { node.textContent = p.complete ? 'Знакомство пройдено. Можно повторить.' : p.count ? `${p.count} из ${p.total} заданий пройдено` : 'Начни с одного небольшого открытия.'; });
  $$('[data-progress-bar]').forEach(node => { node.style.setProperty('--progress', (p.count / p.total * 100) + '%'); node.setAttribute('aria-valuenow', String(p.count)); node.setAttribute('aria-valuemax', String(p.total)); });
  $$('[data-started]').forEach(node => { node.hidden = p.count === 0; });
  const catalog = $('[data-catalog]');
  if (catalog) catalog.innerHTML = learningPaths.map(path => {
    const available = path.status === 'available';
    return `<article class="path-card ${available ? 'path-ready' : 'path-planned'}">
      <div class="path-art ${available ? 'mint-art' : 'lavender-art'}" aria-hidden="true">${available ? `<span class="drawn-equation">? <span>+ 3 = 8</span></span><img src="${url('assets/pix.webp')}" width="150" height="150" alt="">` : '<span class="drawn-equation">x <span>+ идея</span></span><span class="paper-tag hand">Шаг за шагом</span>'}</div>
      <div class="path-copy"><span class="tag ${available ? '' : 'muted-tag'}">${escape(path.kind)}</span><h2>${escape(path.title)}</h2><p>${escape(path.description)}</p>
      <div class="path-bottom">${available ? `<span class="path-meta">${lessonCount(path.lessons.length)} · без подготовки</span><a class="button dark" href="${url(path.href)}">Выбрать занятие <span aria-hidden="true">↗</span></a>` : '<span class="planned-status">В разработке</span><span class="path-meta">Появится здесь, когда будет готов</span>'}</div></div></article>`;
  }).join('');
  const list = $('[data-lessons]');
  if (list) {
    const path = learningPaths.find(item => item.id === list.dataset.lessons);
    if (path?.status === 'available') list.innerHTML = path.lessons.map(lesson => {
      const progress = readLessonProgress(lesson);
      return `<article class="lesson-row"><span class="lesson-symbol" aria-hidden="true">✳</span><div class="lesson-copy"><span class="kicker">${progress.complete ? 'Пройдено' : progress.count ? 'Ты уже начал' : 'Вводное занятие'}</span><h3><a href="${url(lesson.href)}">${escape(lesson.title)}</a></h3><p>${escape(lesson.description)}</p><span class="lesson-meta">${progress.count ? `${progress.count} из ${progress.total} заданий` : `${progress.total} маленьких заданий · в своём темпе`}</span></div><a class="button dark" href="${url(lesson.href + progress.fragment)}">${progress.complete ? 'Повторить' : progress.count ? 'Продолжить' : 'Начать'} <span aria-hidden="true">↗</span></a></article>`;
    }).join('');
  }
}
renderProgress();
window.addEventListener('pageshow', event => { if (event.persisted) renderProgress(); });
window.addEventListener('storage', event => { if (!event.key || event.key === introLesson.storageKey) renderProgress(); });
// Existing bookmarks into the old one-page lesson retain their destination.
const oldAnchors = new Set(['intro','math','backward','language','code','transfer','finish']);
if (document.body.dataset.page === 'home' && oldAnchors.has(location.hash.slice(1))) {
  location.replace(url(introLesson.href + location.hash));
}
if ('IntersectionObserver' in window) {
  document.body.classList.add('motion-ready');
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    entry.target.classList.toggle('in-view', entry.isIntersecting);
    if (entry.isIntersecting && !entry.target.dataset.seen) {
      entry.target.dataset.seen = 'yes';
      if (!document.body.classList.contains('still')) entry.target.animate?.([{opacity:.45,transform:'translateY(14px)'},{opacity:1,transform:'translateY(0)'}], {duration:480,easing:'ease-out'});
    }
  }));
  $$('.reveal, .home-stage').forEach(element => observer.observe(element));
}

// Shared page visibility and motion preferences live in site-chrome.js.
