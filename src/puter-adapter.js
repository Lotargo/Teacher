/** Puter is intentionally not loaded until the user explicitly opts into AI. */
import { getAiText } from './pix-core.js';
export const PUTER_CDN = 'https://js.puter.com/v2/';
let sdkPromise;

export function loadPuter({ doc = document, host = window } = {}) {
  if (host.puter?.ai?.chat) return Promise.resolve(host.puter);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = doc.createElement('script');
    script.src = PUTER_CDN;
    script.async = true;
    script.onload = () => host.puter?.ai?.chat
      ? resolve(host.puter)
      : reject(new Error('Puter.js загрузился, но ИИ API недоступен.'));
    script.onerror = () => reject(new Error('Не удалось загрузить Puter.js. Проверь соединение или блокировщик.'));
    doc.head.appendChild(script);
  }).catch(error => { sdkPromise = null; throw error; });
  return sdkPromise;
}

/**
 * Puter returns {error, msg} for auth errors; Error.message is not guaranteed.
 * Keep diagnostics plain-language and never show raw server responses/tokens.
 */
export function explainPuterAuthError(cause) {
  const code = String(cause?.error ?? cause?.code ?? '').toLowerCase();
  const message = String(cause?.msg ?? cause?.message ?? '').toLowerCase();
  if (code === 'popup_blocked') {
    return 'Браузер заблокировал окно авторизации Puter. Разреши всплывающее окно и нажми «Войти» ещё раз.';
  }
  if (code === 'auth_window_closed') {
    return 'Окно Puter закрыто до завершения входа. При необходимости можно попробовать ещё раз.';
  }
  if (code === 'unsupported_origin') {
    return 'Puter не принимает адрес страницы. На GitHub Pages вход должен работать через HTTPS, а не через файл на диске.';
  }
  if (/sign.?up|signup|account.*(created|creation)|create.*account|not allowed|captcha|unauthorized/.test(code + ' ' + message)) {
    return 'Puter не смог создать или подтвердить учётную запись. Это ошибка авторизации у провайдера, а не ответ Пикс. Проверь вход напрямую на puter.com; если повторится, сообщи поддержке Puter код ошибки из всплывающего окна.';
  }
  return 'Авторизация Puter не завершилась. Попробуй войти напрямую на puter.com или продолжи пользоваться Пикс без ИИ.';
}

export async function askPuter(puter, messages) {
  if (!puter?.ai?.chat) throw new Error('Puter ещё не подключён.');
  const response = await puter.ai.chat(messages, { normalize: true });
  return getAiText(response);
}
