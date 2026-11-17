/**
 * АГА! / Пикс. Cloudflare Workers AI, Gemma 4.
 * Access: owner-only PILOT_TOKEN, or Turnstile + per-IP rate limit.
 * Secrets never belong in the GitHub Pages bundle.
 */
const SITE_ORIGIN = "https://lotargo.github.io";
const SITE_HOSTNAME = "lotargo.github.io";
const MODEL = "@cf/google/gemma-4-26b-a4b-it";
const DEFAULT_INSTRUCTIONS = [
  "Ты Пикс — доброжелательная, иногда шутливая проводница по образовательной лаборатории АГА!.",
  "Отвечай по-русски, кратко и ясно, без снисходительности.",
  "Не предполагай, что ученик знаком с математикой или синтаксисом программирования.",
  "Когда просят подсказку, помогай понять подход, не раскрывая готовый ответ сразу.",
  "Используй бытовые аналогии и проверяемые примеры, не придумывай материалы или страницы.",
  "Ты не управляешь браузером, не редактируешь файлы и не выполняешь пользовательский код.",
  "Объясняй, что важные выводы и ответы ИИ требуют проверки.",
  "Не запрашивай пароли, токены и чужие персональные данные."
].join(" ");
const CONTEXT = {
  home: "Главная: выбор направления по интересу.",
  catalog: "Практика: небольшие интерактивные задачи.",
  start: "Знакомство: семь открытий от яблок до первой программы.",
  lesson: "Первое занятие: яблоки, сложение, неизвестное и код.",
  math: "Математика для жизни: проценты, скидки, материалы и время.",
  workshop: "Мастерская: составление задания для собственного проекта.",
  library: "Библиотека: статьи и внешние ресурсы.",
  article: "Статья о проверке результатов работы ИИ.",
  faq: "Вопросы об АГА!, Пикс и добровольном облачном ИИ."
};
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }
});
function cors(origin) {
  return origin === SITE_ORIGIN
    ? { "Access-Control-Allow-Origin": SITE_ORIGIN, Vary: "Origin" }
    : { Vary: "Origin" };
}
function validMessages(messages) {
  return Array.isArray(messages) && messages.length >= 1 && messages.length <= 9
    && messages.at(-1)?.role === "user"
    && messages.every(message =>
      message && (message.role === "user" || message.role === "assistant")
      && typeof message.content === "string"
      && message.content.trim().length > 0 && message.content.length <= 1500
    );
}
async function verifyChallenge(request, token, env) {
  if (!env.TURNSTILE_SECRET || typeof token !== "string" || token.length > 2048 || !token) {
    return false;
  }
  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET,
    response: token,
    remoteip: request.headers.get("CF-Connecting-IP") || ""
  });
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) return false;
  const answer = await response.json();
  return answer.success === true
    && answer.hostname === SITE_HOSTNAME
    && answer.action === "pix_chat";
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const headers = cors(origin);
    if (request.method === "OPTIONS" && url.pathname === "/chat" && origin === SITE_ORIGIN) {
      return new Response(null, { status: 204, headers: {
        ...headers,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "600"
      }});
    }
    if (request.method === "GET" && url.pathname === "/") {
      return json({ status: "online", model: "gemma-4-26b-a4b-it", endpoint: "POST /chat" }, 200, headers);
    }
    if (request.method !== "POST" || url.pathname !== "/chat") {
      return json({ error: "Not found" }, 404, headers);
    }
    if (origin && origin !== SITE_ORIGIN) return json({ error: "Forbidden origin" }, 403, headers);
    if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      return json({ error: "Expected application/json" }, 415, headers);
    }

    let data;
    try {
      const raw = await request.text();
      if (raw.length > 16000) return json({ error: "Request too large" }, 413, headers);
      data = JSON.parse(raw);
    } catch { return json({ error: "Invalid JSON" }, 400, headers); }
    if (!validMessages(data?.messages)) return json({ error: "Invalid messages" }, 400, headers);

    const authorization = request.headers.get("Authorization");
    const owner = Boolean(env.PILOT_TOKEN) && authorization === "Bearer " + env.PILOT_TOKEN;
    if (authorization && !owner) return json({ error: "Unauthorized" }, 401, headers);

    if (!owner) {
      // CORS alone is NOT authentication. Public mode fails closed without both bindings.
      if (origin !== SITE_ORIGIN) return json({ error: "Forbidden" }, 403, headers);
      if (!env.TURNSTILE_SECRET || !env.CHAT_LIMITER) {
        return json({ error: "Public AI is not configured" }, 503, headers);
      }
      const ip = request.headers.get("CF-Connecting-IP");
      if (!ip) return json({ error: "Verification unavailable" }, 503, headers);
      try {
        const limit = await env.CHAT_LIMITER.limit({ key: "pix:" + ip });
        if (!limit.success) {
          return json({ error: "Rate limit exceeded" }, 429, { ...headers, "Retry-After": "60" });
        }
        if (!(await verifyChallenge(request, data.turnstileToken, env))) {
          return json({ error: "Challenge failed" }, 403, headers);
        }
      } catch { return json({ error: "Verification unavailable" }, 503, headers); }
    }

    const page = Object.hasOwn(CONTEXT, data.page) ? data.page : "home";
    const messages = [
      { role: "system", content: (env.PIXIE_SYSTEM_PROMPT || DEFAULT_INSTRUCTIONS) + "\nТекущий раздел: " + CONTEXT[page] },
      ...data.messages
    ];
    try {
      const result = await env.AI.run(MODEL, {
        messages, temperature: 0.85, max_completion_tokens: 768
      });
      const reply = result?.choices?.[0]?.message?.content ?? result?.response ?? "";
      if (typeof reply !== "string" || !reply.trim()) {
        return json({ error: "Model returned no text" }, 502, headers);
      }
      return json({ reply: reply.trim().slice(0, 6000) }, 200, headers);
    } catch { return json({ error: "Model temporarily unavailable" }, 503, headers); }
  }
};
