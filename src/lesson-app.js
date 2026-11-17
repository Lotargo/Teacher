import { stories, codeTasks, taskIds, checkNumber } from './lesson-data.js';
import { executeMiniPython, MiniPythonError } from './interpreter.js';
import { gradeCode } from './grading.js';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const KEY = 'aga-connected-story-v2', MOTION = 'aga-motion';
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state = { done:[], drafts:{} }, activeCode = codeTasks[0], sandbox = false, toastTimer;
try { const data = JSON.parse(localStorage.getItem(KEY)); if (data && typeof data === 'object') state = { done:Array.isArray(data.done) ? [...new Set(data.done.filter(id => taskIds.includes(id)))] : [], drafts:typeof data.drafts === 'object' && data.drafts ? data.drafts : {} }; } catch { /* Storage is optional. */ }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* The lesson still works. */ } };
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let motionWanted = true;
try { motionWanted = localStorage.getItem(MOTION) !== 'off'; } catch { /* Default. */ }
function applyMotion() {
  document.body.classList.toggle('still', !motionWanted || reduced.matches);
  if (!motionWanted || reduced.matches) document.getAnimations?.().forEach(animation => animation.cancel());
  $('#motion-toggle').setAttribute('aria-pressed', String(motionWanted && !reduced.matches));
  $('#motion-toggle').textContent = reduced.matches ? 'Анимация: выкл. системой' : 'Анимация: ' + (motionWanted ? 'вкл.' : 'выкл.');
  $('#motion-toggle').disabled = reduced.matches;
}
$('#motion-toggle').addEventListener('click', () => { motionWanted = !motionWanted; try { localStorage.setItem(MOTION, motionWanted ? 'on' : 'off'); } catch {} applyMotion(); });
reduced.addEventListener('change', applyMotion); applyMotion();
function message(node, text, ok = false) { node.textContent = text; node.classList.toggle('success', ok); }
function toast(text) { clearTimeout(toastTimer); $('#toast').textContent = text; $('#toast').hidden = false; toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3500); }
function celebrate(node) {
  if (document.body.classList.contains('still') || !node.animate) return;
  node.animate([{ transform:'scale(.98)' }, { transform:'scale(1.015)' }, { transform:'scale(1)' }], { duration:450 });
}
function updateProgress() {
  const count = state.done.length;
  $('#progress-label').textContent = count + ' из ' + taskIds.length + ' открытий';
  $('#progress-bar').setAttribute('aria-valuenow', count);
  $('#progress-bar').setAttribute('aria-valuemax', taskIds.length);
  $('#progress-fill').style.width = (count / taskIds.length * 100) + '%';
  $('#finish-progress').textContent = count === taskIds.length ? 'Вся история пройдена. Можно вернуться и поэкспериментировать с числами.' : count + ' из ' + taskIds.length + ' открытий. Можно продолжить позже в этом браузере.';
  $('#finish-title').textContent = count === taskIds.length ? 'Ты связал историю, запись и действие.' : 'Не ответ «пять», а способ думать.';
  $$('[data-code]').forEach(b => { b.classList.toggle('done', state.done.includes(b.dataset.code)); });
}
function complete(id, element) { if (!state.done.includes(id)) { state.done.push(id); persist(); updateProgress(); celebrate(element); toast('Ещё одна понятная связь. Не спеши: ниже есть разбор.'); } }
function resultHTML(task, next = '') {
  return '<div class="result-heading"><span aria-hidden="true">✦</span><h4>Вот что ты сейчас сделал</h4></div><p>' + esc(task.insight) + '</p><div class="meaning-formula">' + esc(task.formula) + '</div><div class="use-cases"><div><span class="hand">Где это в жизни?</span><p>' + esc(task.life) + '</p></div><div><span class="hand">А где в программе?</span><pre>' + esc(task.code) + '</pre><p>' + esc(task.codeMeaning) + '</p></div></div>' + next;
}
function attachHints(host, task) {
  host.replaceChildren(); let count = 0;
  const label = document.createElement('p'); label.className = 'hand'; label.textContent = 'Зацепимся за знакомое';
  const panel = document.createElement('div'); panel.className = 'hint-steps'; panel.id = 'hint-' + task.id;
  const button = document.createElement('button'); button.type = 'button'; button.className = 'hint-button'; button.textContent = 'Бытовая подсказка'; button.setAttribute('aria-controls', panel.id); button.setAttribute('aria-expanded', 'false');
  button.addEventListener('click', () => {
    const text = document.createElement('p'); text.textContent = task.hints[count++]; panel.append(text); button.setAttribute('aria-expanded', 'true');
    button.textContent = count === 1 ? 'Помоги выбрать действие' : count === 2 ? 'Показать разбор' : 'Все подсказки открыты';
    button.disabled = count === task.hints.length;
  });
  host.append(label, panel, button);
}
function mountStory(task, host) {
  const section = document.createElement('section'); section.id = task.section; section.className = 'chapter reveal'; section.setAttribute('aria-labelledby', task.id + '-title');
  const visual = task.visual.map((v,i) => '<div class="equation-cell ' + (i % 2 ? 'operator' : '') + '"><small>' + esc(task.labels[i]) + '</small><b>' + esc(v) + '</b></div>').join('');
  const input = task.choices ? '<div class="choices" role="group" aria-label="Что обозначает x?">' + task.choices.map((v,i) => '<button type="button" data-choice="' + i + '">' + esc(v) + '</button>').join('') + '</div>' : (task.needsOperation ? '<fieldset class="operation"><legend>Какое действие вернёт нас к началу?</legend><label><input type="radio" name="transfer-operation" value="+"> Прибавить ещё</label><label><input type="radio" name="transfer-operation" value="-"> Убрать добавленное</label></fieldset>' : '') + '<form class="answer-form"><label for="answer-' + task.id + '">Твой ответ</label><div class="counter"><button type="button" data-delta="-1" aria-label="Уменьшить ответ на один">−</button><input id="answer-' + task.id + '" type="number" min="0" max="20" step="1" placeholder="?" inputmode="numeric" autocomplete="off" aria-describedby="feedback-' + task.id + '"><button type="button" data-delta="1" aria-label="Увеличить ответ на один">+</button></div><button type="submit" class="button coral">Проверить мысль ↗</button></form>';
  section.innerHTML = '<div class="chapter-intro"><span class="kicker">' + esc(task.kicker) + '</span><h2 id="' + task.id + '-title">' + esc(task.title) + '</h2><p>' + esc(task.bridge) + '</p></div><div class="exercise-layout"><div class="exercise-card"><p class="purpose"><span aria-hidden="true">✳</span> Зачем: ' + esc(task.purpose) + '</p><h3>' + esc(task.question) + '</h3><div class="visual-equation" aria-label="' + esc(task.visual.join(' ')) + '">' + visual + '</div>' + (task.counts ? '<div class="apple-groups" aria-label="Пять яблок и три яблока"><span aria-hidden="true">🍎🍎🍎🍎🍎</span><b aria-hidden="true">+</b><span aria-hidden="true">🍎🍎🍎</span></div>' : '') + input + '<p class="feedback" id="feedback-' + task.id + '" role="status">Можно попробовать, проверить и изменить ответ.</p></div><aside class="hint-card"><img src="../../assets/pix.webp" width="130" height="130" alt="" loading="lazy" class="bobbing"><div class="hint-host"></div></aside></div><div class="result" hidden></div>';
  host.append(section); attachHints(section.querySelector('.hint-host'), task);
  const feedback = section.querySelector('.feedback'), result = section.querySelector('.result');
  function reveal() { result.innerHTML = resultHTML(task, '<a class="next-link" href="' + task.next + '">' + esc(task.nextText) + ' <span aria-hidden="true">→</span></a>'); result.hidden = false; }
  function check(value, button) {
    const outcome = task.choices ? { ok:value === task.answer, message:value === task.answer ? task.success : 'Посмотри на подписи: 3 — добавили, 8 — стало. Буква заменяет неизвестное первоначальное количество.' } : checkNumber(task, value, section.querySelector('input[type="radio"]:checked')?.value);
    message(feedback, outcome.message, outcome.ok);
    if (outcome.ok) { reveal(); complete(task.id, result); } else { result.hidden = true; section.classList.remove('try-again'); void section.offsetWidth; section.classList.add('try-again'); }
    if (button && task.choices) { section.querySelectorAll('[data-choice]').forEach(b => { b.classList.remove('chosen'); b.setAttribute('aria-pressed', 'false'); }); button.classList.add('chosen'); button.setAttribute('aria-pressed','true'); }
  }
  if (task.choices) section.querySelectorAll('[data-choice]').forEach(b => { b.setAttribute('aria-pressed','false'); b.addEventListener('click', () => check(Number(b.dataset.choice), b)); });
  else {
    const field = section.querySelector('input[type="number"]');
    const changed = () => { result.hidden = true; message(feedback, 'Ответ изменён. Проверь новую догадку.'); };
    field.addEventListener('input', changed); section.querySelectorAll('input[type="radio"]').forEach(r => r.addEventListener('change', changed));
    section.querySelectorAll('[data-delta]').forEach(b => b.addEventListener('click', () => { const previous = Number(field.value); field.value = Math.min(20, Math.max(0, (Number.isFinite(previous) ? previous : 0) + Number(b.dataset.delta))); changed(); }));
    section.querySelector('form').addEventListener('submit', e => { e.preventDefault(); check(field.value); });
    if (state.done.includes(task.id)) { field.value = task.answer; if (task.needsOperation) section.querySelector('input[value="-"]').checked = true; }
  }
  if (state.done.includes(task.id)) { reveal(); message(feedback, task.success, true); }
}
stories.filter(t => t.id !== 'transfer').forEach(t => mountStory(t, $('#story-exercises')));
mountStory(stories.find(t => t.id === 'transfer'), $('#transfer-exercise'));
const editor = $('#code-editor');
function renderCodeResult() {
  const nextIndex = codeTasks.indexOf(activeCode) + 1;
  $('#code-result').innerHTML = resultHTML(activeCode, nextIndex < codeTasks.length ? '<button class="next-link" type="button" id="next-code">' + (nextIndex === 1 ? 'Теперь попросим посчитать' : 'Теперь найдём начало') + ' →</button>' : '<a class="next-link" href="#transfer">Проверим этот способ на новой истории →</a>');
  $('#code-result').hidden = false;
  $('#next-code')?.addEventListener('click', () => { selectCode(codeTasks[nextIndex].id); $('#code-task-title').scrollIntoView({ block:'center', behavior:document.body.classList.contains('still') ? 'instant' : 'smooth' }); });
}
function saveDraft() { if (!sandbox) { state.drafts[activeCode.id] = editor.value; persist(); } }
function dirtyCode() { saveDraft(); $('#code-result').hidden = true; $('#code-output').textContent = 'Код изменён. Запусти его, чтобы увидеть новый результат.'; message($('#code-feedback'), ''); }
function selectCode(id) {
  activeCode = codeTasks.find(t => t.id === id) || codeTasks[0]; sandbox = false;
  $('#code-purpose').textContent = activeCode.purpose; $('#code-task-title').textContent = activeCode.title; $('#code-task-text').textContent = activeCode.text;
  const draft = state.drafts[id]; editor.value = typeof draft === 'string' && draft.length <= 4000 ? draft : activeCode.starter;
  $('#code-output').textContent = 'Результат появится здесь.'; message($('#code-feedback'), ''); $('#code-result').hidden = true;
  $$('[data-code]').forEach(b => { const selected = b.dataset.code === id; b.classList.toggle('active', selected); b.setAttribute('aria-pressed', selected); }); attachHints($('#code-hints'), activeCode);
}
$$('[data-code]').forEach(b => b.addEventListener('click', () => { saveDraft(); selectCode(b.dataset.code); }));
editor.addEventListener('input', dirtyCode);
editor.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runCode(); } });
$$('[data-token]').forEach(b => b.addEventListener('click', () => { const start = editor.selectionStart, token = b.dataset.token; editor.setRangeText(token, start, editor.selectionEnd, 'end'); if (token === 'print()') editor.setSelectionRange(start + 6, start + 6); editor.focus(); dirtyCode(); }));
$('#restore-code').addEventListener('click', () => { editor.value = sandbox ? 'яблоки = 5\nprint(яблоки + 3)' : activeCode.starter; dirtyCode(); });
function runCode() {
  saveDraft(); $('#code-output').classList.remove('error');
  try {
    const execution = executeMiniPython(editor.value);
    $('#code-output').textContent = execution.lines.length ? execution.output || '(пустая строка)' : 'Ничего не показано. Добавь команду print( ).';
    if (sandbox) { message($('#code-feedback'), 'Это свободный эксперимент с именем. Измени значение в первой строке и посмотри, как меняется результат. Задания выше доступны по вкладкам.'); return; }
    const outcome = gradeCode(activeCode, execution); message($('#code-feedback'), outcome.message, outcome.ok);
    if (outcome.ok) { renderCodeResult(); complete(activeCode.id, $('#code-result')); } else $('#code-result').hidden = true;
  } catch (error) {
    $('#code-output').classList.add('error'); $('#code-output').textContent = error instanceof MiniPythonError ? 'Строка ' + error.line + ': ' + error.message : 'Тренажёр не смог обработать программу. Верни заготовку и попробуй ещё раз.';
    $('#code-result').hidden = true; message($('#code-feedback'), 'Посмотри сообщение: оно подсказывает, где запись перестала быть понятной компьютеру.');
  }
}
$('#run-code').addEventListener('click', runCode);
$('#try-variable').addEventListener('click', () => {
  saveDraft(); sandbox = true; editor.value = 'яблоки = 5\nprint(яблоки + 3)';
  $('#code-purpose').textContent = 'Необязательный эксперимент'; $('#code-task-title').textContent = 'Имя вместо числа'; $('#code-task-text').textContent = 'Меняй число в первой строке. Вторая строка возьмёт сохранённое значение, прибавит 3 и покажет результат. Здесь нет отметки за правильный ответ.';
  $$('[data-code]').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); }); $('#code-hints').replaceChildren(); dirtyCode(); editor.focus();
});
$('#reset-progress').addEventListener('click', () => { if (!confirm('Сбросить отметки и черновики этого урока?')) return; state = { done:[], drafts:{} }; persist(); location.reload(); });
const resumeCode = location.hash === '#code' ? codeTasks.find(t => !state.done.includes(t.id))?.id : null;
selectCode(resumeCode || 'show'); updateProgress();
// Content remains visible without JS or observer support. Only animate on entry.
if ('IntersectionObserver' in window) {
  const reveal = new IntersectionObserver(entries => entries.forEach(entry => {
    entry.target.classList.toggle('in-view', entry.isIntersecting);
    if (entry.isIntersecting && !entry.target.dataset.seen) {
      entry.target.dataset.seen = 'true';
      if (!document.body.classList.contains('still') && entry.target.animate) entry.target.animate([{ opacity:.4, transform:'translateY(18px)' }, { opacity:1, transform:'translateY(0)' }], { duration:520, easing:'cubic-bezier(.2,.7,.3,1)' });
    }
  }), { threshold:0, rootMargin:'0px 0px -30px 0px' });
  $$('.reveal, .hero, .sidebar-note').forEach(node => reveal.observe(node));
  const navigation = new IntersectionObserver(entries => { const entry = entries.find(e => e.isIntersecting); if (!entry) return; $$('.lesson-nav a').forEach(a => { if (a.hash === '#' + entry.target.id) a.setAttribute('aria-current','location'); else a.removeAttribute('aria-current'); }); }, { rootMargin:'-5% 0px -75% 0px', threshold:0 });
  ['intro','math','backward','language','code','transfer'].forEach(id => navigation.observe($('#' + id)));
}
