import { PATHS, getPageContext, buildAiMessages } from './pix-core.js';
import { askCloudflare } from './cloudflare-adapter.js';
import { TURNSTILE_SITE_KEY, CLOUDFLARE_CHAT_URL } from './cloudflare-config.js';
import { clampPosition, createTextPresenter } from './pix-ui.js';
import { createMoodController, spritePosition } from './pix-moods.js';
import { claimGreeting } from './pix-session.js';
import { PixieError, friendlyError } from './pix-errors.js';

const page = getPageContext(document.body.dataset.page || 'home').route;
const root = new URL('../', import.meta.url);
const stylesheet = document.createElement('link');
stylesheet.rel = 'stylesheet';
stylesheet.href = new URL('../styles/pix.css', import.meta.url).href;
document.head.appendChild(stylesheet);

// This greeting is local copy, not an inference or an entry in model history.
export const GREETING = 'Привет! Я Пикси ✨\n\nГотова ответить на твои вопросы: помочь с уроком, поговорить о наболевшем или вместе придумать, как затащить в Dota 2.\n\nРасполагайся. Что у тебя на уме?';
const host = document.createElement('aside');
host.id = 'pix-guide';
host.className = 'pix-guide';
host.dataset.state = 'hello';
host.setAttribute('aria-label', 'Помощница Пикси');
host.innerHTML = `
  <button class="pix-launcher" type="button" aria-label="Открыть Пикси" aria-controls="pix-panel" aria-expanded="false">
    <span class="pix-unread" id="pix-unread" aria-hidden="true" hidden><span class="pix-unread-icon">✉</span><b>1</b></span>
    <span class="pix-launch-art"><span class="pix-pose" aria-hidden="true"></span></span>
    <span class="pix-launch-label">Пикс <span aria-hidden="true">✦</span></span>
  </button>
  <section class="pix-panel" id="pix-panel" role="dialog" aria-label="Пикси — твоя собеседница" aria-modal="false" hidden>
    <header class="pix-panel-head" id="pix-drag-handle" tabindex="0" aria-label="Переместить окно Пикси: перетащи шапку или используй стрелки на клавиатуре">
      <span class="pix-pose pix-head-pose" aria-hidden="true"></span>
      <div class="pix-identity"><span class="pix-eyebrow">АГА! · твой проводник</span><h2>Пикс</h2><p>И разобраться. И просто поболтать.</p></div>
      <div class="pix-window-controls" role="group" aria-label="Управление окном">
        <button class="pix-window-button pix-sound" id="pix-sound" type="button" aria-label="Выключить звук" aria-pressed="true" title="Выключить звук"><span class="pix-control-dot"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6h3l3-3v10l-3-3H3zM11 5q4 3 0 6"/></svg></span></button>
        <button class="pix-window-button pix-expand" id="pix-expand" type="button" aria-label="Развернуть чат" aria-pressed="false" title="Развернуть чат"><span class="pix-control-dot"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 7V3h4m2 10h4V9M3 3l4 4m6 6L9 9"/></svg></span></button>
        <button class="pix-window-button pix-close" type="button" aria-label="Закрыть Пикси" title="Закрыть"><span class="pix-control-dot"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M4 12l8-8"/></svg></span></button>
      </div>
    </header>
    <div class="pix-chat-log" id="pix-chat-log" role="log" aria-label="Диалог с Пикси" aria-live="off"></div>
    <div class="pix-chat-dock">
      <div class="pix-thinking" id="pix-thinking" role="status" hidden><span class="pix-spinner" aria-hidden="true"></span><span id="pix-thinking-text">Пикси думает…</span></div>
      <div id="pix-turnstile" aria-label="Проверка подключения"></div>
      <form id="pix-chat-form" class="pix-chat-form">
        <label class="pix-sr-only" for="pix-chat-question">Сообщение Пикси</label>
        <div class="pix-composer">
          <textarea id="pix-chat-question" rows="2" maxlength="1200" placeholder="Напиши вопрос или расскажи, как ты…" required></textarea>
          <div class="pix-composer-foot"><span class="pix-input-hint">Enter — отправить · Shift+Enter — строка</span><div class="pix-send-controls">
            <button type="button" id="pix-stop" class="pix-stop" hidden>■ Стоп</button>
            <button type="submit" class="pix-send" id="pix-send">Отправить <span aria-hidden="true">↗</span></button>
          </div></div>
        </div>
      </form>
      <div class="pix-chat-bottom"><button type="button" id="pix-clear-chat" class="pix-clear">Очистить диалог</button></div>
      <p class="pix-error" id="pix-chat-status" role="alert" hidden></p>
    </div>
    <footer class="pix-footer"><a id="pix-faq-link" href="#">Вопросы и приватность</a><p id="pix-privacy-notice">Отправляя сообщение, ты передаёшь его облачному ИИ.</p></footer>
    <span class="pix-sr-only" id="pix-announcement" role="status" aria-live="polite"></span>
  </section>`;
document.body.appendChild(host);
const get = selector => host.querySelector(selector);
const panel = get('#pix-panel'), launcher = get('.pix-launcher'), log = get('#pix-chat-log');
const input = get('#pix-chat-question'), send = get('#pix-send'), stop = get('#pix-stop');
const status = get('#pix-chat-status'), thinking = get('#pix-thinking'), clear = get('#pix-clear-chat');
const soundButton = get('#pix-sound'), expandButton = get('#pix-expand');
get('#pix-faq-link').href = new URL(PATHS.faq.path, root).href;
let turns = [], pending = false, activeRequest = null, unread = 0;
let soundEnabled = true, audioContext = null;
const AudioCtor = window.AudioContext || window.webkitAudioContext;
const moods = createMoodController((state, expression) => {
  host.dataset.state = state;
  const position = spritePosition(expression);
  if (position) {
    host.dataset.expression = expression;
    host.style.setProperty('--pix-x', position.x + '%');
    host.style.setProperty('--pix-y', position.y + '%');
  } else {
    delete host.dataset.expression;
    host.style.removeProperty('--pix-x'); host.style.removeProperty('--pix-y');
  }
});
const moodMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
function syncMoodMotion() {
  if (document.hidden || document.body.classList.contains('still') || moodMotion.matches) moods.pause();
  else moods.resume();
}
const moodObserver = new MutationObserver(syncMoodMotion);
moodObserver.observe(document.body, { attributes:true, attributeFilter:['class'] });
moodMotion.addEventListener('change', syncMoodMotion);
document.addEventListener('visibilitychange', syncMoodMotion);
window.addEventListener('pagehide', () => moods.pause());
window.addEventListener('pageshow', syncMoodMotion);
syncMoodMotion();
function pose(state) { moods.setActivity(state); }
function isReading() { return !panel.hidden && !document.hidden; }
function setUnread(count, options = {}) {
  unread = count;
  moods.setUnread(count, options);
  get('#pix-unread').hidden = count === 0;
  get('#pix-unread b').textContent = count > 9 ? '9+' : String(count);
  launcher.setAttribute('aria-label', 'Открыть Пикси' + (count ? `, непрочитанных сообщений: ${count}` : ''));
}
function announce(text) { get('#pix-announcement').textContent = text; }
function notify() { if (!isReading()) setUnread(unread + 1); }
function open() {
  panel.hidden = false; launcher.setAttribute('aria-expanded', 'true');
  host.classList.add('is-open'); setUnread(0); clampPanel();
  log.scrollTop = log.scrollHeight; input.focus({ preventScroll:true });
}
function close() {
  panel.hidden = true; launcher.setAttribute('aria-expanded', 'false');
  host.classList.remove('is-open'); launcher.focus({ preventScroll:true });
}
launcher.addEventListener('click', () => panel.hidden ? open() : close());
get('.pix-close').addEventListener('click', close);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); close(); }
});
document.addEventListener('visibilitychange', () => { if (isReading()) setUnread(0); });

// Sound is enabled by default, but audio is unlocked only by a real user gesture.
function unlockAudio() {
  if (!soundEnabled || !AudioCtor) return;
  try { audioContext ||= new AudioCtor(); void audioContext.resume().catch(() => {}); }
  catch { /* Browsers without audio still have the visual notification. */ }
}
host.addEventListener('pointerdown', unlockAudio);
host.addEventListener('keydown', unlockAudio);
soundButton.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  soundButton.setAttribute('aria-pressed', String(soundEnabled));
  soundButton.setAttribute('aria-label', soundEnabled ? 'Выключить звук' : 'Включить звук');
  soundButton.title = soundButton.getAttribute('aria-label');
  if (soundEnabled) unlockAudio();
});
function playSound(kind = 'done') {
  if (!soundEnabled || !audioContext || audioContext.state !== 'running') return;
  try {
    const notes = kind === 'error' ? [330] : [660, 880];
    notes.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator(), volume = audioContext.createGain();
      const start = audioContext.currentTime + index * .09;
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      volume.gain.setValueAtTime(.0001, start);
      volume.gain.exponentialRampToValueAtTime(.03, start + .018);
      volume.gain.exponentialRampToValueAtTime(.0001, start + .15);
      oscillator.connect(volume).connect(audioContext.destination);
      oscillator.start(start); oscillator.stop(start + .16);
    });
  } catch { /* Never block a message because of sound. */ }
}

// Move the non-modal window without trapping the lesson or allowing it off-screen.
const handle = get('#pix-drag-handle');
let draggedPosition = null, beforeExpand = null, drag = null;
function place(left, top) {
  const rect = panel.getBoundingClientRect();
  const pos = clampPosition(left, top, rect.width, rect.height, innerWidth, innerHeight);
  panel.style.left = pos.left + 'px'; panel.style.top = pos.top + 'px';
  panel.style.right = 'auto'; panel.style.bottom = 'auto';
  draggedPosition = pos;
}
function resetPosition() { ['left','top','right','bottom'].forEach(key => panel.style.removeProperty(key)); }
function clampPanel() {
  if (innerWidth <= 600) { resetPosition(); return; }
  if (draggedPosition && !host.classList.contains('is-expanded')) place(draggedPosition.left, draggedPosition.top);
}
function toggleExpanded() {
  const expanded = host.classList.toggle('is-expanded');
  if (expanded) { beforeExpand = draggedPosition; resetPosition(); }
  else { draggedPosition = beforeExpand; clampPanel(); }
  expandButton.setAttribute('aria-pressed', String(expanded));
  expandButton.setAttribute('aria-label', expanded ? 'Свернуть чат' : 'Развернуть чат');
  expandButton.title = expandButton.getAttribute('aria-label');
}
expandButton.addEventListener('click', toggleExpanded);
handle.addEventListener('dblclick', e => { if (!e.target.closest('button')) toggleExpanded(); });
handle.addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.target.closest('button,a') || host.classList.contains('is-expanded') || innerWidth <= 600) return;
  const rect = panel.getBoundingClientRect();
  drag = { id:e.pointerId, x:e.clientX, y:e.clientY, left:rect.left, top:rect.top };
  handle.setPointerCapture(e.pointerId); host.classList.add('is-dragging');
  e.preventDefault();
});
handle.addEventListener('pointermove', e => {
  if (drag?.id === e.pointerId) place(drag.left + e.clientX - drag.x, drag.top + e.clientY - drag.y);
});
function endDrag(e) {
  if (drag?.id !== e.pointerId) return;
  drag = null; host.classList.remove('is-dragging');
  if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
}
['pointerup','pointercancel','lostpointercapture'].forEach(type => handle.addEventListener(type, endDrag));
handle.addEventListener('keydown', e => {
  if (e.target !== handle || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key) || host.classList.contains('is-expanded') || innerWidth <= 600) return;
  e.preventDefault(); const r = panel.getBoundingClientRect(), step = e.shiftKey ? 60 : 20;
  place(r.left + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0), r.top + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0));
});
window.addEventListener('resize', clampPanel);
window.visualViewport?.addEventListener('resize', clampPanel);

// No requests, SDKs or inference on page load/open. First Send is the opt-in.
let publicSiteKey = TURNSTILE_SITE_KEY, widgetId = null, sdkPromise = null, challenge = '', challengeWaiter = null;
function loadTurnstile() {
  if (window.turnstile?.render) return Promise.resolve(window.turnstile);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => { script.remove(); reject(new PixieError('verification')); }, 15000);
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async = true;
    script.onload = () => { clearTimeout(timer); window.turnstile?.render ? resolve(window.turnstile) : reject(new PixieError('verification')); };
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new PixieError('verification')); };
    document.head.appendChild(script);
  }).catch(error => { sdkPromise = null; throw error; });
  return sdkPromise;
}
async function getChallenge(signal) {
  if (!publicSiteKey) {
    const endpoint = new URL(CLOUDFLARE_CHAT_URL); endpoint.pathname = '/config';
    const response = await fetch(endpoint, { cache:'no-store', signal });
    const config = response.ok ? await response.json() : null;
    if (!config?.publicEnabled || typeof config.sitekey !== 'string' || !config.sitekey) throw new PixieError('unavailable');
    publicSiteKey = config.sitekey;
  }
  const turnstile = await loadTurnstile(); signal.throwIfAborted();
  if (challenge) { const token = challenge; challenge = ''; return token; }
  return new Promise((resolve, reject) => {
    const finish = (error, token) => {
      clearTimeout(timer); signal.removeEventListener('abort', onAbort); challengeWaiter = null;
      error ? reject(error) : resolve(token);
    };
    const onAbort = () => finish(new DOMException('Cancelled', 'AbortError'));
    const timer = setTimeout(() => finish(new PixieError('verification')), 45000);
    challengeWaiter = finish; signal.addEventListener('abort', onAbort, { once:true });
    try {
      if (widgetId === null) {
        widgetId = turnstile.render(get('#pix-turnstile'), {
          sitekey:publicSiteKey, action:'pix_chat', theme:document.documentElement.dataset.theme || 'auto', size:'flexible', appearance:'interaction-only',
          callback(token) { if (challengeWaiter) challengeWaiter(null, token); else challenge = token; },
          'expired-callback'() { challenge = ''; },
          'error-callback'() { challenge = ''; challengeWaiter?.(new PixieError('verification')); }
        });
      } else turnstile.reset(widgetId);
    } catch { finish(new PixieError('verification')); }
  });
}
let followTail = true;
log.addEventListener('scroll', () => { followTail = nearBottom(); });
function nearBottom() { return log.scrollHeight - log.scrollTop - log.clientHeight < 90; }
function bubble(role, text = '') {
  const row = document.createElement('div'); row.className = 'pix-message is-' + role;
  if (role === 'assistant') { const avatar = document.createElement('span'); avatar.className = 'pix-message-avatar'; avatar.textContent = '✦'; avatar.setAttribute('aria-hidden','true'); row.append(avatar); }
  const card = document.createElement('div'); card.className = 'pix-bubble is-' + role;
  const name = document.createElement('strong'); name.textContent = role === 'user' ? 'Ты' : 'Пикси';
  const body = document.createElement('p'); body.textContent = text;
  card.append(name, body); row.append(card); log.append(row); followTail = true; log.scrollTop = log.scrollHeight;
  return { row, body, card };
}
function resizeComposer() { input.style.height = 'auto'; input.style.height = Math.min(144, Math.max(64, input.scrollHeight)) + 'px'; }
input.addEventListener('input', resizeComposer);
function showError(text) { status.textContent = text; status.hidden = !text; }
async function sendMessage(options = {}) {
  if (pending) { if (options.external) throw new PixieError('busy'); return; }
  const question = (options.question ?? input.value).trim();
  if (!question) return;
  const request = new AbortController();
  let timedOut = false;
  activeRequest = request; pending = true; send.disabled = true; clear.disabled = true; input.disabled = true;
  stop.hidden = false; thinking.hidden = false; showError(''); input.value = ''; resizeComposer();
  get('#pix-privacy-notice').hidden = true;
  const user = bubble('user', question), assistant = bubble('assistant');
  assistant.card.classList.add('is-waiting'); assistant.body.classList.add('pix-typing-dots'); assistant.body.textContent = '•••';
  let presenter = null;
  const timeout = setTimeout(() => { timedOut = true; request.abort(); }, 120000);
  pose('thinking'); get('#pix-thinking-text').textContent = 'Соединяюсь…';
  try {
    const token = await getChallenge(request.signal); request.signal.throwIfAborted();
    get('#pix-thinking-text').textContent = 'Пикси думает…';
    const reply = await askCloudflare(buildAiMessages(page, turns, question, options.external ? 3000 : 1200), {
      page, turnstileToken:token, signal:request.signal,
      onDelta(text) {
        request.signal.throwIfAborted();
        if (!presenter) {
          assistant.card.classList.remove('is-waiting'); assistant.body.classList.remove('pix-typing-dots');
          assistant.body.textContent = ''; thinking.hidden = true; pose('typing');
          presenter = createTextPresenter(assistant.body, { signal:request.signal, onRender:() => { if (followTail) log.scrollTop = log.scrollHeight; } });
        }
        presenter.push(text);
        options.onDelta?.(text);
      }
    });
    request.signal.throwIfAborted();
    if (!presenter) { assistant.body.classList.remove('pix-typing-dots'); presenter = createTextPresenter(assistant.body, { signal:request.signal }); presenter.push(reply); }
    await presenter.finish(); request.signal.throwIfAborted();
    turns.push({ role:'user', content:question }, { role:'assistant', content:reply }); turns = turns.slice(-8);
    pose('idea'); notify(); playSound('done'); announce('Пикси ответила.');
    return reply;
  } catch (error) {
    presenter?.stop(); assistant.row.remove(); user.row.remove(); input.value = question; resizeComposer();
    const cancelled = error?.name === 'AbortError' && !timedOut;
    const safeError = timedOut ? new PixieError('timeout') : error;
    if (cancelled) showError('Ответ остановлен. Сообщение осталось в поле ввода.');
    else { const text = friendlyError(safeError); bubble('assistant', text); notify(); announce(text); }
    pose(cancelled ? 'hello' : 'error'); if (!cancelled) playSound('error');
    if (options.external) throw safeError;
  } finally {
    clearTimeout(timeout); presenter?.stop(); pending = false; activeRequest = null;
    input.disabled = false; send.disabled = false; clear.disabled = false; stop.hidden = true; thinking.hidden = true;
    if (isReading()) input.focus({ preventScroll:true });
  }
}
// Only the workshop's explicit button dispatches this handoff. Never scrape forms.
window.addEventListener('aga:workshop-help', event => {
  if (page !== 'workshop' || typeof event.detail?.prompt !== 'string' || event.detail.prompt.length > 3000) return;
  event.preventDefault();
  open();
  const {prompt, onDelta, resolve, reject} = event.detail;
  if (typeof resolve !== 'function' || typeof reject !== 'function') return;
  void sendMessage({question:prompt, external:true, onDelta: typeof onDelta === 'function' ? onDelta : undefined}).then(resolve,reject);
});
stop.addEventListener('click', () => activeRequest?.abort());
get('#pix-chat-form').addEventListener('submit', e => { e.preventDefault(); void sendMessage(); });
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); void sendMessage(); }
});
clear.addEventListener('click', () => { turns = []; log.replaceChildren(); bubble('assistant', 'Начнём с чистого листа. Я рядом ✨'); showError(''); pose('hello'); });
bubble('assistant', GREETING);
setUnread(claimGreeting() ? 1 : 0, { initial:true });
