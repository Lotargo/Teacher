import { PATHS, getPageContext, getSuggestions, getLocalAnswer, guessLocalIntent, buildAiMessages } from './pix-core.js';
import { askCloudflare } from './cloudflare-adapter.js';
import { TURNSTILE_SITE_KEY, CLOUDFLARE_CHAT_URL } from './cloudflare-config.js';

const page = getPageContext(document.body.dataset.page || 'home').route;
const root = new URL('../', import.meta.url);
const stylesheet = document.createElement('link');
stylesheet.rel = 'stylesheet';
stylesheet.href = new URL('../styles/pix.css', import.meta.url).href;
document.head.appendChild(stylesheet);

const host = document.createElement('aside');
host.id = 'pix-guide';
host.className = 'pix-guide';
host.dataset.state = 'hello';
host.setAttribute('aria-label', 'Помощница Пикс');
host.innerHTML = `
  <button class="pix-launcher" type="button" aria-label="Открыть помощницу Пикс" aria-controls="pix-panel" aria-expanded="false">
    <span class="pix-pose" aria-hidden="true"></span>
    <span class="pix-launch-label">Пикс <span aria-hidden="true">✦</span></span>
  </button>
  <section class="pix-panel" id="pix-panel" role="dialog" aria-label="Пикс — помощница АГА!" aria-modal="false" hidden>
    <div class="pix-panel-head">
      <span class="pix-pose pix-head-pose" aria-hidden="true"></span>
      <div class="pix-identity">
        <span class="pix-eyebrow">АГА! · твой проводник</span>
        <h2>Пикс <span class="pix-presence" aria-label="На связи">● На связи</span></h2>
        <p>Помогу разобраться, а не зазубрить.</p>
      </div>
      <div class="pix-head-tools">
        <button type="button" class="pix-icon-button" id="pix-sound" aria-label="Включить звуки чата" aria-pressed="false" title="Включить звуки">♪</button>
        <button type="button" class="pix-icon-button" id="pix-expand" aria-label="Развернуть чат" aria-pressed="false" title="Развернуть окно">⤢</button>
        <button class="pix-close" type="button" aria-label="Закрыть Пикс">×</button>
      </div>
    </div>
    <div class="pix-mode-switch" role="group" aria-label="Режим помощницы">
      <button type="button" class="pix-mode is-current" data-pix-mode="local" aria-pressed="true">Без ИИ</button>
      <button type="button" class="pix-mode" data-pix-mode="ai" aria-pressed="false">Gemma 4 · ИИ <span aria-hidden="true">✦</span></button>
    </div>
    <div class="pix-body">
      <section class="pix-local" id="pix-local">
        <p class="pix-section-label">С чем помочь сегодня?</p>
        <div class="pix-chips" id="pix-chips"></div>
        <form id="pix-search-form" class="pix-search-form">
          <label class="pix-sr-only" for="pix-search">Спроси Пикс о портале</label>
          <input id="pix-search" maxlength="400" placeholder="Например: где изучить проценты?" autocomplete="off">
          <button type="submit" aria-label="Найти подсказку">↗</button>
        </form>
        <div class="pix-answer" id="pix-answer" role="status" aria-live="polite"></div>
        <p class="pix-local-note">Здесь я работаю без ИИ: подсказываю путь по сайту и простые аналогии. Всё локально.</p>
      </section>
      <section class="pix-ai" id="pix-ai" hidden>
        <div id="pix-ai-consent" class="pix-consent">
          <div class="pix-ai-sticker" aria-hidden="true">✧</div>
          <h3>Хочешь поговорить с ИИ?</h3>
          <p>Это <strong>необязательная</strong> беседа с Gemma 4 через Cloudflare. Аккаунт и оплата не нужны, но у бесплатной модели есть ограничения.</p>
          <p>Только при отправке в Cloudflare попадут твой вопрос, название раздела и до восьми предыдущих реплик диалога. Не отправляй пароли и чужие личные данные. АГА! не сохраняет переписку в собственной базе.</p>
          <details id="pix-owner-entry" class="pix-owner-entry">
            <summary>Для владельца: вход по личному токену</summary>
            <label class="pix-secret-label" for="pix-owner-key">Личный доступ для тестирования</label>
            <input id="pix-owner-key" type="password" autocomplete="off" spellcheck="false" placeholder="PILOT_TOKEN владельца">
            <p class="pix-owner-note">Публичный доступ ещё не настроен: сейчас нужен токен владельца. Не публикуй его. Он не сохраняется после перезагрузки страницы.</p>
          </details>
          <button type="button" id="pix-connect-cloudflare" class="pix-primary">Подключить облачный ИИ</button>
          <p id="pix-connect-status" class="pix-status" role="status" aria-live="polite"></p>
        </div>
        <div id="pix-ai-chat" class="pix-ai-chat" hidden>
          <div class="pix-chat-topline">
            <span class="pix-model-chip"><span class="pix-model-dot"></span> Gemma 4 <span aria-hidden="true">·</span> Cloudflare</span>
            <span class="pix-privacy-label">Диалог только в этой вкладке</span>
          </div>
          <div class="pix-chat-log" id="pix-chat-log" role="log" aria-label="Диалог с Пикс" aria-live="off">
            <div class="pix-chat-intro"><span class="pix-intro-spark" aria-hidden="true">✳</span><strong>С чего начнём?</strong><p>Спроси о том, что не получается, или просто поделись идеей. Попробуем разобраться вместе.</p></div>
          </div>
          <div class="pix-chat-dock">
            <div class="pix-thinking" id="pix-thinking" role="status" aria-live="polite" hidden>
              <span class="pix-spinner" aria-hidden="true"></span>
              Пикс подбирает слова…
            </div>
            <div id="pix-turnstile" class="pix-turnstile" aria-label="Проверка Cloudflare" hidden></div>
            <form id="pix-chat-form" class="pix-chat-form">
              <label class="pix-sr-only" for="pix-chat-question">Вопрос к Пикс через Cloudflare</label>
              <div class="pix-composer">
                <textarea id="pix-chat-question" maxlength="1200" rows="2" placeholder="Напиши вопрос или расскажи об идее…" required></textarea>
                <div class="pix-composer-foot">
                  <span class="pix-input-hint">Enter — отправить · Shift+Enter — строка</span>
                  <div class="pix-send-controls">
                    <button type="button" id="pix-stop" class="pix-stop" hidden aria-label="Остановить ответ">■ Стоп</button>
                    <button type="submit" class="pix-primary pix-send" id="pix-send">Отправить <span aria-hidden="true">↗</span></button>
                  </div>
                </div>
              </div>
            </form>
            <div class="pix-chat-bottom">
              <button type="button" id="pix-clear-chat" class="pix-muted">Очистить диалог</button>
              <p class="pix-status" id="pix-chat-status" role="status" aria-live="polite">Ответы ИИ лучше проверять.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
    <div class="pix-footer"><a id="pix-faq-link" href="#">Вопросы и приватность</a><span>АГА! · помощница по желанию</span></div>
  </section>`;
document.body.appendChild(host);

const get = selector => host.querySelector(selector);
const launcher = get('.pix-launcher'), panel = get('#pix-panel');
const faqLink = get('#pix-faq-link');
faqLink.href = new URL(PATHS.faq.path, root).href;
const chips = get('#pix-chips'), answer = get('#pix-answer');
let activeMode = 'local';
let accessMode = '';
let ownerToken = '';
let challengeToken = '';
let widgetId = null;
let turnstileScript = null;
let publicSiteKey = TURNSTILE_SITE_KEY;
let loading = false;
let pending = false;
let turns = [];

function pose(state) { host.dataset.state = ['hello', 'thinking', 'idea', 'guide'].includes(state) ? state : 'hello'; }
function open() {
  panel.hidden = false; launcher.setAttribute('aria-expanded', 'true');
  host.classList.add('is-open'); get('.pix-close').focus();
}
function close() {
  panel.hidden = true; launcher.setAttribute('aria-expanded', 'false');
  host.classList.remove('is-open'); launcher.focus();
}
launcher.addEventListener('click', () => panel.hidden ? open() : close());
get('.pix-close').addEventListener('click', close);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); close(); }
});
// The panel is non-modal so the lesson behind Pix remains interactive.
const soundButton = get('#pix-sound');
const expandButton = get('#pix-expand');
let soundEnabled = false;
let audioContext = null;
const AudioCtor = window.AudioContext || window.webkitAudioContext;

soundButton.addEventListener('click', async () => {
  soundEnabled = !soundEnabled;
  soundButton.setAttribute('aria-pressed', String(soundEnabled));
  soundButton.setAttribute('aria-label', soundEnabled ? 'Выключить звуки чата' : 'Включить звуки чата');
  soundButton.title = soundEnabled ? 'Выключить звуки' : 'Включить звуки';
  soundButton.textContent = soundEnabled ? '♫' : '♪';
  if (soundEnabled && AudioCtor) {
    try {
      audioContext ||= new AudioCtor();
      await audioContext.resume();
    } catch { soundEnabled = false; soundButton.setAttribute('aria-pressed', 'false'); }
  }
});

function playSound(kind = 'done') {
  if (!soundEnabled || document.hidden || !AudioCtor) return;
  try {
    audioContext ||= new AudioCtor();
    if (audioContext.state === 'suspended') void audioContext.resume();
    const now = audioContext.currentTime;
    const notes = kind === 'error' ? [350] : [620, 820];
    notes.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const volume = audioContext.createGain();
      const start = now + index * 0.095;
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      volume.gain.setValueAtTime(0.0001, start);
      volume.gain.exponentialRampToValueAtTime(0.035, start + 0.018);
      volume.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
      oscillator.connect(volume).connect(audioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.15);
    });
  } catch { /* No sound support: the text chat still works. */ }
}

expandButton.addEventListener('click', () => {
  const expanded = host.classList.toggle('is-expanded');
  expandButton.setAttribute('aria-pressed', String(expanded));
  expandButton.setAttribute('aria-label', expanded ? 'Свернуть чат' : 'Развернуть чат');
  expandButton.title = expanded ? 'Свернуть окно' : 'Развернуть окно';
  expandButton.textContent = expanded ? '⤡' : '⤢';
});


function renderLocal(id) {
  const result = getLocalAnswer(id);
  pose(result.state);
  answer.replaceChildren();
  const p = document.createElement('p'); p.textContent = result.text; answer.appendChild(p);
  const links = document.createElement('div'); links.className = 'pix-answer-links';
  for (const link of result.links) {
    const a = document.createElement('a');
    a.href = new URL(link.path, root).href;
    a.textContent = link.label + ' ↗';
    links.appendChild(a);
  }
  answer.appendChild(links);
}
for (const { id, label } of getSuggestions(page)) {
  const button = document.createElement('button'); button.type = 'button';
  button.className = 'pix-chip'; button.textContent = label + ' ↗';
  button.addEventListener('click', () => renderLocal(id)); chips.appendChild(button);
}
get('#pix-search-form').addEventListener('submit', event => {
  event.preventDefault();
  const input = get('#pix-search');
  if (!input.value.trim()) { input.focus(); return; }
  renderLocal(guessLocalIntent(input.value, page));
});
renderLocal(page === 'lesson' ? 'lesson' : page === 'math' ? 'math' : page === 'workshop' ? 'idea' : 'how');

function mode(next) {
  activeMode = next;
  get('#pix-local').hidden = next !== 'local';
  get('#pix-ai').hidden = next !== 'ai';
  host.querySelectorAll('[data-pix-mode]').forEach(button => {
    const selected = button.dataset.pixMode === next;
    button.setAttribute('aria-pressed', String(selected));
    button.classList.toggle('is-current', selected);
  });
  pose(next === 'ai' ? 'thinking' : 'hello');
}
host.querySelectorAll('[data-pix-mode]').forEach(button => button.addEventListener('click', () => mode(button.dataset.pixMode)));

const status = get('#pix-connect-status');
function setStatus(message) { status.textContent = message; }
function showConnected() {
  get('#pix-ai-consent').hidden = true;
  get('#pix-ai-chat').hidden = false;
  pose('idea');
  get('#pix-chat-question').focus();
}
function loadTurnstile() {
  if (window.turnstile?.render) return Promise.resolve(window.turnstile);
  if (turnstileScript) return turnstileScript;
  turnstileScript = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => window.turnstile?.render
      ? resolve(window.turnstile)
      : reject(new Error('Проверка Cloudflare не загрузилась.'));
    script.onerror = () => reject(new Error('Не удалось загрузить проверку Cloudflare.'));
    document.head.appendChild(script);
  }).catch(error => { turnstileScript = null; throw error; });
  return turnstileScript;
}
get('#pix-owner-entry').hidden = Boolean(TURNSTILE_SITE_KEY);
async function discoverPublicSiteKey() {
  if (publicSiteKey) return publicSiteKey;
  try {
    const endpoint = new URL(CLOUDFLARE_CHAT_URL);
    endpoint.pathname = '/config';
    const response = await fetch(endpoint, { cache:'no-store' });
    if (!response.ok) return '';
    const config = await response.json();
    if (config?.publicEnabled && typeof config.sitekey === 'string' && config.sitekey) {
      publicSiteKey = config.sitekey;
      get('#pix-owner-entry').hidden = true;
      return publicSiteKey;
    }
  } catch { /* Owner-only pilot remains available if config is unreachable. */ }
  return '';
}

get('#pix-connect-cloudflare').addEventListener('click', async event => {
  if (loading) return;
  const button = event.currentTarget;
  loading = true; button.disabled = true;
  try {
    const siteKey = await discoverPublicSiteKey();
    if (siteKey) {
      setStatus('Загружаю проверку Cloudflare…');
      const turnstile = await loadTurnstile();
      accessMode = 'public';
      showConnected();
      const mount = get('#pix-turnstile');
      mount.hidden = false;
      get('#pix-send').disabled = true;
      widgetId = turnstile.render(mount, {
        sitekey: siteKey,
        action: 'pix_chat',
        theme: 'light',
        size: 'flexible',
        appearance: 'interaction-only',
        callback(token) {
          challengeToken = token;
          if (!pending) get('#pix-send').disabled = false;
          get('#pix-chat-status').textContent = 'Проверка готова. Можно отправить сообщение.';
        },
        'expired-callback'() {
          challengeToken = '';
          get('#pix-send').disabled = true;
          get('#pix-chat-status').textContent = 'Проверка устарела. Подожди обновления.';
        },
        'error-callback'() {
          challengeToken = '';
          get('#pix-send').disabled = true;
          get('#pix-chat-status').textContent = 'Cloudflare не смог проверить подключение.';
        }
      });
    } else {
      const key = get('#pix-owner-key');
      const token = key.value.trim();
      if (!token) { setStatus('Введи личный PILOT_TOKEN для тестирования.'); key.focus(); return; }
      ownerToken = token;
      key.value = '';
      accessMode = 'owner';
      showConnected();
    }
  } catch(error) {
    get('#pix-ai-consent').hidden = false;
    get('#pix-ai-chat').hidden = true;
    setStatus(error?.message || 'Не удалось подключить Cloudflare.');
    pose('guide');
  } finally { loading = false; button.disabled = false; }
});

const form = get('#pix-chat-form');
const input = get('#pix-chat-question');
const log = get('#pix-chat-log');
const chatStatus = get('#pix-chat-status');
const send = get('#pix-send');
const stop = get('#pix-stop');
const thinking = get('#pix-thinking');
const clearButton = get('#pix-clear-chat');
let activeRequest = null;

function resizeComposer() {
  input.style.height = 'auto';
  input.style.height = Math.min(160, Math.max(72, input.scrollHeight)) + 'px';
}
input.addEventListener('input', resizeComposer);

function bubble(role, text = '', options = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'pix-message ' + (role === 'user' ? 'is-user' : 'is-pix');
  if (role !== 'user') {
    const avatar = document.createElement('span');
    avatar.className = 'pix-message-avatar';
    avatar.textContent = '✦';
    avatar.setAttribute('aria-hidden', 'true');
    wrap.appendChild(avatar);
  }
  const card = document.createElement('div');
  card.className = 'pix-bubble ' + (role === 'user' ? 'is-user' : 'is-pix');
  const name = document.createElement('strong');
  name.textContent = role === 'user' ? 'Ты' : 'Пикс';
  const body = document.createElement('p');
  body.textContent = text;
  card.append(name, body);
  wrap.appendChild(card);
  log.appendChild(wrap);
  if (options.waiting) {
    body.textContent = '';
    const dots = document.createElement('span');
    dots.className = 'pix-typing-dots';
    dots.setAttribute('aria-label', 'Пикс печатает');
    for (let i = 0; i < 3; i++) dots.appendChild(document.createElement('i'));
    body.appendChild(dots);
    card.classList.add('is-waiting');
  }
  log.scrollTop = log.scrollHeight;
  return { wrap, card, body };
}

function textPresenter(node) {
  let target = '', shown = 0, frame = 0, finishResolve = null;
  const reduced = () => document.hidden || document.body.classList.contains('still')
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function render() {
    frame = 0;
    const backlog = target.length - shown;
    shown = reduced() ? target.length : Math.min(target.length, shown + Math.max(3, Math.ceil(backlog / 12)));
    node.textContent = target.slice(0, shown); // Never render model HTML.
    log.scrollTop = log.scrollHeight;
    if (shown < target.length) frame = requestAnimationFrame(render);
    else if (finishResolve) { finishResolve(); finishResolve = null; }
  }
  return {
    push(part) {
      if (!part) return;
      target += part;
      if (!frame) frame = requestAnimationFrame(render);
    },
    async finish(reply) {
      if (reply.length > target.length) target = reply;
      if (shown >= target.length) return;
      await new Promise(resolve => {
        finishResolve = resolve;
        if (!frame) frame = requestAnimationFrame(render);
      });
    },
    stop() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (finishResolve) { finishResolve(); finishResolve = null; }
    }
  };
}

async function sendMessage() {
  if (pending || !accessMode) return;
  if (accessMode === 'public' && !challengeToken) {
    chatStatus.textContent = 'Подожди подтверждения проверки Cloudflare.';
    return;
  }
  const question = input.value.trim();
  if (!question) return;

  pending = true;
  input.disabled = true;
  send.disabled = true;
  clearButton.disabled = true;
  stop.hidden = false;
  thinking.hidden = false;
  input.value = '';
  resizeComposer();
  const user = bubble('user', question);
  const assistant = bubble('assistant', '', { waiting:true });
  const request = new AbortController();
  activeRequest = request;
  let presenter = null;
  pose('thinking');
  chatStatus.textContent = 'Пикс готовит ответ…';

  try {
    const messages = buildAiMessages(page, turns, question);
    const reply = await askCloudflare(messages, {
      page, signal: request.signal,
      ...(accessMode === 'owner' ? { ownerToken } : { turnstileToken: challengeToken }),
      onDelta(text) {
        if (!presenter) {
          assistant.card.classList.remove('is-waiting');
          assistant.body.replaceChildren();
          presenter = textPresenter(assistant.body);
          thinking.hidden = true;
        }
        presenter.push(text);
      }
    });
    if (!presenter) {
      assistant.body.replaceChildren();
      assistant.card.classList.remove('is-waiting');
      presenter = textPresenter(assistant.body);
    }
    await presenter.finish(reply);
    turns.push({ role:'user', content:question }, { role:'assistant', content:reply });
    turns = turns.slice(-8);
    pose('idea');
    playSound('done');
    chatStatus.textContent = 'Готово! Важные выводы лучше проверить самостоятельно.';
  } catch(error) {
    presenter?.stop();
    assistant.wrap.remove();
    user.wrap.remove();
    input.value = question; // Let the user retry without retyping.
    resizeComposer();
    if (error?.name === 'AbortError') {
      chatStatus.textContent = 'Ответ остановлен. Вопрос сохранился в поле ввода.';
    } else {
      pose('guide');
      bubble('assistant', 'Не удалось получить ответ. Попробуй ещё раз или используй локальные подсказки.');
      chatStatus.textContent = error?.message || 'Неизвестная ошибка Cloudflare.';
      playSound('error');
    }
  } finally {
    pending = false;
    activeRequest = null;
    thinking.hidden = true;
    stop.hidden = true;
    input.disabled = false;
    clearButton.disabled = false;
    if (accessMode === 'public') {
      challengeToken = '';
      send.disabled = true;
      if (widgetId !== null) window.turnstile?.reset(widgetId);
    } else send.disabled = false;
    if (!panel.hidden && activeMode === 'ai') input.focus();
  }
}

stop.addEventListener('click', () => activeRequest?.abort());
form.addEventListener('submit', event => {
  event.preventDefault();
  void sendMessage();
});
input.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    void sendMessage();
  }
});
clearButton.addEventListener('click', () => {
  turns = [];
  log.replaceChildren();
  const p = document.createElement('p');
  p.className = 'pix-chat-intro';
  p.textContent = 'Диалог очищен. Можно начать новую тему!';
  log.appendChild(p);
  chatStatus.textContent = 'Готова слушать!';
  pose('hello');
});
// No external code loads before the user opts in; owner token stays in memory only.
