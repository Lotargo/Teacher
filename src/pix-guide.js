import { PATHS, getPageContext, getSuggestions, getLocalAnswer, guessLocalIntent, buildAiMessages } from './pix-core.js';
import { loadPuter, askPuter, explainPuterAuthError } from './puter-adapter.js';

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
      <button type="button" class="pix-mode" data-pix-mode="ai" aria-pressed="false">ИИ через Puter <span aria-hidden="true">✦</span></button>
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
          <p>Это <strong>необязательная</strong> функция через сторонний сервис Puter. Сначала загрузим его SDK, затем ты сам решишь, входить ли в аккаунт.</p>
          <p><strong>АГА! ничего не продаёт и не получает процент.</strong> Puter даёт собственный бесплатный лимит; если он закончится, дальнейшая оплата — только Puter, по его условиям.</p>
          <p>Твой вопрос, контекст текущего раздела и последние реплики диалога будут отправлены в Puter и могут обрабатываться поставщиками моделей. Не отправляй пароли и чужие личные данные.</p>
          <button type="button" id="pix-load-puter" class="pix-primary">Загрузить Puter.js</button>
          <button type="button" id="pix-login" class="pix-primary" hidden>Войти через Puter</button>
          <p id="pix-connect-status" class="pix-status" role="status" aria-live="polite"></p>
          <p id="pix-login-help" class="pix-login-help" hidden>Уже есть аккаунт? Нажми «Log In» в окне Puter. Можно проверить вход отдельно на <a href="https://puter.com/" target="_blank" rel="noopener noreferrer">Puter.com ↗</a>. Если регистрация не работает и там, обратись в <a href="mailto:support@puter.com">поддержку Puter</a> с кодом из окна ошибки. АГА! не управляет регистрацией.</p>
        </div>
        <div id="pix-ai-chat" class="pix-ai-chat" hidden>
          <div class="pix-chat-log" id="pix-chat-log" role="log" aria-label="Диалог с Пикс" aria-live="polite" aria-relevant="additions text">
            <p class="pix-chat-intro">Теперь можно спросить по-настоящему. Я вижу только название текущего раздела и то, что ты сам напишешь.</p>
          </div>
          <form id="pix-chat-form" class="pix-chat-form">
            <label class="pix-sr-only" for="pix-chat-question">Вопрос к Пикс через Puter</label>
            <textarea id="pix-chat-question" maxlength="1200" rows="2" placeholder="О чём хочешь поговорить?" required></textarea>
            <div class="pix-chat-actions"><button type="button" id="pix-clear-chat" class="pix-muted">Очистить диалог</button><button type="submit" class="pix-primary" id="pix-send">Отправить ↗</button></div>
          </form>
          <p class="pix-status" id="pix-chat-status" role="status" aria-live="polite">Запросы расходуют лимит твоего Puter-аккаунта. Enter — отправить, Shift+Enter — новая строка.</p>
        </div>
      </section>
    </div>
    <div class="pix-footer"><a id="pix-faq-link" href="#">Вопросы и оплата</a><span>АГА! · помощница по желанию</span></div>
  </section>`;
document.body.appendChild(host);

const get = selector => host.querySelector(selector);
const launcher = get('.pix-launcher'), panel = get('#pix-panel');
const faqLink = get('#pix-faq-link');
faqLink.href = new URL(PATHS.faq.path, root).href;
const chips = get('#pix-chips'), answer = get('#pix-answer');
let activeMode = 'local';
let puterClient = null;
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
function setStatus(text) { status.textContent = text; }
function showConnected() {
  get('#pix-login-help').hidden = true;
  get('#pix-ai-consent').hidden = true;
  get('#pix-ai-chat').hidden = false;
  pose('idea'); get('#pix-chat-question').focus();
}
const loadButton = get('#pix-load-puter');
loadButton.addEventListener('click', async () => {
  if (loading) return;
  loading = true; loadButton.disabled = true; setStatus('Подключаю библиотеку Puter…');
  try {
    puterClient = await loadPuter();
    if (puterClient.auth?.isSignedIn?.()) {
      showConnected();
    } else {
      loadButton.hidden = true;
      get('#pix-login').hidden = false;
      setStatus('SDK подключён. Вход в Puter — отдельное добровольное действие.');
    }
  } catch (error) {
    setStatus(error?.message || 'Не получилось подключить Puter. Локальные подсказки работают без него.');
    loadButton.disabled = false;
    pose('thinking');
  } finally { loading = false; }
});
// signIn is called synchronously from the click handler (popup-blocker requirement).
get('#pix-login').addEventListener('click', async event => {
  if (!puterClient?.auth?.signIn) { setStatus('Puter не предоставил функцию входа.'); return; }
  const button = event.currentTarget;
  button.disabled = true;
  setStatus('Ожидаю подтверждения входа в Puter…');
  get('#pix-login-help').hidden = true;
  try {
    const signInPromise = puterClient.auth.signIn();
    await signInPromise;
    showConnected();
  } catch (error) {
    setStatus(explainPuterAuthError(error));
    get('#pix-login-help').hidden = false;
    pose('guide');
  } finally { button.disabled = false; }
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
  if (pending || !puterClient?.ai?.chat) return;
  const question = input.value.trim();
  if (!question) return;
  pending = true; send.disabled = true; input.disabled = true; input.value = '';
  bubble('user', question); chatStatus.textContent = 'Пикс думает…'; pose('thinking');
  try {
    const messages = buildAiMessages(page, turns, question);
    const reply = await askPuter(puterClient, messages);
    bubble('assistant', reply);
    turns.push({role:'user',content:question}, {role:'assistant',content:reply});
    turns = turns.slice(-8);
    pose('idea');
    chatStatus.textContent = 'Ответ сгенерирован ИИ. Важные выводы лучше проверить самостоятельно.';
  } catch (error) {
    pose('guide');
    bubble('assistant', 'Не удалось получить ответ. Локальные подсказки по-прежнему доступны в соседнем режиме.');
    chatStatus.textContent = 'Запрос не завершён: ' + (error?.message || 'неизвестная ошибка Puter');
  } finally { pending = false; send.disabled = false; input.disabled = false; input.focus(); }
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
// No SDK is loaded here. Only explicit click on #pix-load-puter fetches remote code.
