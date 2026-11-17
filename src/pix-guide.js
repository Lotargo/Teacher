import { PATHS, getPageContext, getSuggestions, getLocalAnswer, guessLocalIntent, buildAiMessages } from './pix-core.js';
import { askCloudflare } from './cloudflare-adapter.js';
import { TURNSTILE_SITE_KEY } from './cloudflare-config.js';

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
      <div><h2>Привет! Я Пикс.</h2><p>Помогу разобраться, а не зазубрить.</p></div>
      <button class="pix-close" type="button" aria-label="Закрыть Пикс">×</button>
    </div>
    <div class="pix-mode-switch" role="group" aria-label="Режим помощницы">
      <button type="button" class="pix-mode is-current" data-pix-mode="local" aria-pressed="true">Без ИИ</button>
      <button type="button" class="pix-mode" data-pix-mode="ai" aria-pressed="false">ИИ через Cloudflare <span aria-hidden="true">✦</span></button>
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
          <div id="pix-owner-entry">
            <label class="pix-secret-label" for="pix-owner-key">Личный доступ для тестирования</label>
            <input id="pix-owner-key" type="password" autocomplete="off" spellcheck="false" placeholder="PILOT_TOKEN владельца">
            <p class="pix-owner-note">Публичный доступ ещё не настроен: сейчас нужен токен владельца. Не публикуй его. Он не сохраняется после перезагрузки страницы.</p>
          </div>
          <button type="button" id="pix-connect-cloudflare" class="pix-primary">Подключить облачный ИИ</button>
          <p id="pix-connect-status" class="pix-status" role="status" aria-live="polite"></p>
        </div>
        <div id="pix-ai-chat" class="pix-ai-chat" hidden>
          <div id="pix-turnstile" class="pix-turnstile" aria-label="Проверка Cloudflare" hidden></div>
          <div class="pix-chat-log" id="pix-chat-log" role="log" aria-label="Диалог с Пикс" aria-live="polite" aria-relevant="additions text">
            <p class="pix-chat-intro">Теперь можно спросить по-настоящему. Я вижу только название текущего раздела и то, что ты сам напишешь.</p>
          </div>
          <form id="pix-chat-form" class="pix-chat-form">
            <label class="pix-sr-only" for="pix-chat-question">Вопрос к Пикс через Cloudflare</label>
            <textarea id="pix-chat-question" maxlength="1200" rows="2" placeholder="О чём хочешь поговорить?" required></textarea>
            <div class="pix-chat-actions"><button type="button" id="pix-clear-chat" class="pix-muted">Очистить диалог</button><button type="submit" class="pix-primary" id="pix-send">Отправить ↗</button></div>
          </form>
          <p class="pix-status" id="pix-chat-status" role="status" aria-live="polite">Облачная модель может ошибаться. Enter — отправить, Shift+Enter — новая строка.</p>
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
// Do not turn into a modal: users can interact with the underlying lesson while Pix stays open.

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
get('#pix-connect-cloudflare').addEventListener('click', async event => {
  if (loading) return;
  const button = event.currentTarget;
  loading = true; button.disabled = true;
  try {
    if (TURNSTILE_SITE_KEY) {
      setStatus('Загружаю проверку Cloudflare…');
      const turnstile = await loadTurnstile();
      accessMode = 'public';
      showConnected();
      const mount = get('#pix-turnstile');
      mount.hidden = false;
      get('#pix-send').disabled = true;
      widgetId = turnstile.render(mount, {
        sitekey: TURNSTILE_SITE_KEY,
        action: 'pix_chat',
        theme: 'light',
        size: 'flexible',
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

const form = get('#pix-chat-form'), input = get('#pix-chat-question');
const log = get('#pix-chat-log'), chatStatus = get('#pix-chat-status'), send = get('#pix-send');
function bubble(role, text) {
  const row = document.createElement('div'); row.className = 'pix-bubble ' + (role === 'user' ? 'is-user' : 'is-pix');
  const name = document.createElement('strong'); name.textContent = role === 'user' ? 'Ты' : 'Пикс';
  const body = document.createElement('p'); body.textContent = text;
  row.append(name, body); log.appendChild(row);
  log.scrollTop = log.scrollHeight;
}
async function sendMessage() {
  if (pending || !accessMode) return;
  if (accessMode === 'public' && !challengeToken) {
    chatStatus.textContent = 'Подожди подтверждения проверки Cloudflare.';
    return;
  }
  const question = input.value.trim();
  if (!question) return;
  pending = true; send.disabled = true; input.disabled = true; input.value = '';
  bubble('user', question); chatStatus.textContent = 'Пикс думает…'; pose('thinking');
  try {
    const messages = buildAiMessages(page, turns, question);
    const reply = await askCloudflare(messages, {
      page,
      ...(accessMode === 'owner' ? { ownerToken } : { turnstileToken: challengeToken })
    });
    bubble('assistant', reply);
    turns.push({ role:'user', content:question }, { role:'assistant', content:reply });
    turns = turns.slice(-8);
    pose('idea');
    chatStatus.textContent = 'Ответ сгенерирован ИИ. Важные выводы лучше проверить самостоятельно.';
  } catch(error) {
    pose('guide');
    bubble('assistant', 'Не удалось получить ответ. Локальные подсказки остаются доступны.');
    chatStatus.textContent = 'Запрос не завершён: ' + (error?.message || 'неизвестная ошибка Cloudflare');
  } finally {
    pending = false;
    input.disabled = false;
    if (accessMode === 'public') {
      challengeToken = '';
      send.disabled = true;
      if (widgetId !== null) window.turnstile?.reset(widgetId);
    } else { send.disabled = false; }
    input.focus();
  }
}
form.addEventListener('submit', event => { event.preventDefault(); void sendMessage(); });
input.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault(); void sendMessage();
  }
});
get('#pix-clear-chat').addEventListener('click', () => {
  turns = []; log.replaceChildren();
  const p = document.createElement('p'); p.className = 'pix-chat-intro';
  p.textContent = 'История диалога очищена из этой вкладки. Новые вопросы не будут включать предыдущие реплики.';
  log.appendChild(p);
  chatStatus.textContent = 'Готова слушать!'; pose('hello');
});
// No external code loads before the user opts in; owner token stays in memory only.
