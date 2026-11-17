import { CLOUDFLARE_CHAT_URL } from "./cloudflare-config.js";

/** Browser side. Secrets are never embedded in the repository or localStorage. */
export async function askCloudflare(messages, { page = "home", ownerToken = "", turnstileToken = "", fetcher = fetch } = {}) {
  if (!ownerToken && !turnstileToken) throw new Error("Подтверди доступ к ИИ.");
  const headers = { "Content-Type": "application/json" };
  if (ownerToken) headers.Authorization = "Bearer " + ownerToken;
  let response;
  try {
    response = await fetcher(CLOUDFLARE_CHAT_URL, {
      method: "POST", mode: "cors", cache: "no-store", headers,
      body: JSON.stringify({ messages, page, ...(turnstileToken ? { turnstileToken } : {}) })
    });
  } catch {
    throw new Error("Не удалось подключиться к Cloudflare. Проверь соединение и CORS Worker.");
  }
  if (!response.ok) {
    const messagesByStatus = {
      400: "Неверный формат сообщения.",
      401: "Неверный токен владельца.",
      403: "Проверка доступа Cloudflare не пройдена.",
      413: "Слишком длинная переписка. Очисти диалог и попробуй снова.",
      429: "Слишком много запросов. Попробуй позже.",
      502: "ИИ не вернул текст.",
      503: "ИИ временно недоступен либо публичный доступ ещё не настроен."
    };
    throw new Error(messagesByStatus[response.status] || "Cloudflare вернул ошибку " + response.status + ".");
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error("Cloudflare вернул не JSON."); }
  if (typeof data?.reply !== "string" || !data.reply.trim()) {
    throw new Error("Модель не вернула текст. Попробуй переформулировать вопрос.");
  }
  return data.reply.trim().slice(0, 6000);
}
