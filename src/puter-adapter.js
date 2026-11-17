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

export async function askPuter(puter, messages) {
  if (!puter?.ai?.chat) throw new Error('Puter ещё не подключён.');
  const response = await puter.ai.chat(messages, { normalize: true });
  return getAiText(response);
}
