import { CLOUDFLARE_CHAT_URL } from "./cloudflare-config.js";

const MAX_REPLY = 6000;

/** Parse Cloudflare SSE chunks, selecting only assistant text (never reasoning). */
export async function readCloudflareStream(body, onDelta = () => {}) {
  if (!body || typeof body.getReader !== "function") {
    throw new Error("Поток ответа недоступен.");
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";
  let complete = false;
  function processEvent(event) {
    const data = event.split(/\r?\n/)
      .filter(line => line.startsWith("data:"))
      .map(line => line.slice(5).trimStart()).join("\n");
    if (!data) return;
    if (data === "[DONE]") { complete = true; return; }
    let packet;
    try { packet = JSON.parse(data); }
    catch { return; }
    if (packet?.error) throw new Error("Облачная модель прервала ответ.");
    const delta = packet?.choices?.[0]?.delta?.content;
    const text = typeof delta === "string" ? delta : typeof packet?.response === "string" ? packet.response : "";
    if (!text || reply.length >= MAX_REPLY) return;
    const addition = text.slice(0, MAX_REPLY - reply.length);
    reply += addition;
    onDelta(addition);
  }
  try {
    while (!complete && reply.length < MAX_REPLY) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream:true });
      let match;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const event = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        processEvent(event);
        if (complete || reply.length >= MAX_REPLY) break;
      }
      if (done) {
        if (buffer.trim()) processEvent(buffer);
        break;
      }
      if (buffer.length > 30000) throw new Error("Ошибка формата потока ИИ.");
    }
  } finally {
    if (!complete || reply.length >= MAX_REPLY) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  if (!reply.trim()) throw new Error("Модель не вернула текст. Попробуй ещё раз.");
  return reply.trim();
}

/** Browser side. Secret is supplied by owner only; never embedded in static files. */
export async function askCloudflare(messages, {
  page = "home", ownerToken = "", turnstileToken = "",
  onDelta = () => {}, signal, fetcher = fetch
} = {}) {
  if (!ownerToken && !turnstileToken) throw new Error("Подтверди доступ к ИИ.");
  const headers = { "Content-Type":"application/json", "Accept":"text/event-stream" };
  if (ownerToken) headers.Authorization = "Bearer " + ownerToken;
  let response;
  try {
    response = await fetcher(CLOUDFLARE_CHAT_URL, {
      method:"POST", mode:"cors", cache:"no-store", headers, signal,
      body:JSON.stringify({ messages, page, ...(turnstileToken ? { turnstileToken } : {}) })
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new Error("Не удалось подключиться к Cloudflare. Проверь соединение.");
  }
  if (!response.ok) {
    const map = {
      400:"Неверный формат сообщения.",
      401:"Неверный токен владельца.",
      403:"Проверка Cloudflare не пройдена. Попробуй обновить её.",
      413:"Слишком длинная переписка. Очисти диалог и попробуй снова.",
      429:"Лимит запросов исчерпан. Попробуй через минуту.",
      502:"ИИ не вернул текст.",
      503:"ИИ временно недоступен или публичный доступ ещё не настроен."
    };
    throw new Error(map[response.status] || "Cloudflare вернул ошибку " + response.status + ".");
  }
  const contentType = response.headers.get("Content-Type")?.toLowerCase() || "";
  if (contentType.includes("text/event-stream")) {
    return readCloudflareStream(response.body, onDelta);
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error("Cloudflare вернул ответ в неизвестном формате."); }
  if (typeof data?.reply !== "string" || !data.reply.trim()) {
    throw new Error("Модель не вернула текст. Попробуй переформулировать вопрос.");
  }
  const reply = data.reply.trim().slice(0, MAX_REPLY);
  onDelta(reply); // Smooth typewriter fallback for non-streaming responses.
  return reply;
}
