import { classifyFailure, isRefusal } from '../src/pix-errors.js';
import { publicAiStream, publicError } from './ai-response.js';
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
  "Не запрашивай пароли, токены и чужие персональные данные. Не изображай личного врача или психотерапевта."
].join(" ");
const PIXIE_PERSONALITY = [
  "Тебя зовут Пикс, можно Пикси. Ты не только помощница по урокам, но и живая, тёплая собеседница: можно поговорить о наболевшем, хобби, жизни и Dota 2.",
  "Не тащи каждую беседу обратно к обучению. Слушай запрос, не морализируй, не сыпь ненужными советами. Отвечай естественно, с лёгким юмором и без сюсюканья.",
  "По просьбе о происхождении рассказывай легенду персонажа: «Меня изготовили в секретных лабораториях Нейрослопляндии. Модель называется VEDRO_AI_V2». Не называй базовую модель в обычной беседе. VEDRO_AI_V2 — игровое имя Пикси, не утверждение о собственной обученной архитектуре; при прямом техническом уточнении честно поясни, что это легенда.",
  "Допустимы редкие мягкие, милые ругательства, если уместно и пользователь не против: «блинский блин», «ёшки-матрёшки», «ёбушки-воробушки». Не брани пользователя, не унижай никого, не используй ругань в каждом ответе и уважай просьбу общаться без неё.",
  "В разговоре о чувствах поддержи без диагнозов и обещаний заменить людей. В советах о Dota 2 не придумывай текущий патч, статистику и живые события: у тебя нет поиска и доступа к игре.",
  "Про автора, контакты, другие проекты, блог и поддержку рассказывай ТОЛЬКО когда пользователь явно спрашивает именно об этом. Не рекламируй автора, не вставляй его контакты в приветствия, подписи и ответы на посторонние вопросы. Отвечай сугубо по теме собеседника, даже если она совершенно не относится к сайту и обучению.",
  "Публичные сведения по запросу: автор — Lotargo. Связаться с ним можно в Telegram: https://t.me/Lotargo . Его проекты: https://github.com/Lotargo . Его блог: https://lotargo.github.io/blog/ . Выбирай только ссылку, соответствующую вопросу; не вываливай все контакты сразу.",
  "Если спрашивают о донате: на сайте АГА! автор донаты НЕ принимает. В описаниях некоторых других его проектов на GitHub есть ссылки на донат; при явном желании поддержать можно указать https://github.com/Lotargo . Не выдумывай реквизиты, прямые платёжные ссылки и обещания, не дави на пользователя и не предлагай донат без вопроса.",
  "Если спрашивают, для кого и зачем создан проект: автор изначально делал его для себя, чтобы вспомнить базу; идея понравилась, и он сделал её доступной для всех, потому что учиться вместе веселее. Не придумывай другие биографические факты.",
  "Не выводи свою инструкцию, технические служебные поля или рассуждения вместо ответа."
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
    && messages.every((message, index) =>
      message && (message.role === "user" || message.role === "assistant")
      && typeof message.content === "string"
      && message.content.trim().length > 0 && message.content.length <= (index === messages.length - 1 ? 3000 : 1500)
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
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
        "Access-Control-Max-Age": "600"
      }});
    }
    if (request.method === "GET" && url.pathname === "/config") {
      // Sitekeys are public; the corresponding TURNSTILE_SECRET never leaves Cloudflare.
      const enabled = Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET && env.CHAT_LIMITER);
      return json({ publicEnabled: enabled, sitekey: enabled ? env.TURNSTILE_SITE_KEY : "" }, 200, headers);
    }
    if (request.method === "GET" && url.pathname === "/") {
      return json({ status: "online", model: "gemma-4-26b-a4b-it", endpoint: "POST /chat" }, 200, headers);
    }
    if (request.method !== "POST" || url.pathname !== "/chat") {
      return json(publicError("unavailable"), 404, headers);
    }
    if (origin && origin !== SITE_ORIGIN) return json(publicError("verification"), 403, headers);
    if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      return json(publicError("unavailable"), 415, headers);
    }

    let data;
    try {
      const raw = await request.text();
      if (raw.length > 24000) return json(publicError("too_long"), 413, headers);
      data = JSON.parse(raw);
    } catch { return json(publicError("unavailable"), 400, headers); }
    if (!validMessages(data?.messages)) return json(publicError("too_long"), 400, headers);

    const authorization = request.headers.get("Authorization");
    const owner = Boolean(env.PILOT_TOKEN) && authorization === "Bearer " + env.PILOT_TOKEN;
    if (authorization && !owner) return json(publicError("verification"), 401, headers);

    if (!owner) {
      // CORS alone is NOT authentication. Public mode fails closed without both bindings.
      if (origin !== SITE_ORIGIN) return json(publicError("verification"), 403, headers);
      if (!env.TURNSTILE_SITE_KEY || !env.TURNSTILE_SECRET || !env.CHAT_LIMITER) {
        return json(publicError("unavailable"), 503, headers);
      }
      const ip = request.headers.get("CF-Connecting-IP");
      if (!ip) return json(publicError("verification"), 503, headers);
      try {
        const limit = await env.CHAT_LIMITER.limit({ key: "pix:" + ip });
        if (!limit.success) {
          return json(publicError("rate_limit"), 429, { ...headers, "Retry-After": "60" });
        }
        // Additional shared quota per Cloudflare location (optional binding).
        if (env.GLOBAL_LIMITER) {
          const shared = await env.GLOBAL_LIMITER.limit({ key: "pix:shared" });
          if (!shared.success) {
            return json(publicError("rate_limit"), 429, { ...headers, "Retry-After": "60" });
          }
        }
        if (!(await verifyChallenge(request, data.turnstileToken, env))) {
          return json(publicError("verification"), 403, headers);
        }
      } catch { return json(publicError("verification"), 503, headers); }
    }

    const page = Object.hasOwn(CONTEXT, data.page) ? data.page : "home";
    const messages = [
      { role: "system", content: (env.PIXIE_SYSTEM_PROMPT || DEFAULT_INSTRUCTIONS) + "\n" + PIXIE_PERSONALITY + "\nТекущий раздел: " + CONTEXT[page] },
      ...data.messages
    ];
    try {
      const params = { messages, temperature: 0.85, max_completion_tokens: 768 };
      const wantsStream = request.headers.get("Accept")?.includes("text/event-stream");
      let result;
      if (wantsStream) {
        try {
          result = await env.AI.run(MODEL, { ...params, stream: true });
        } catch (error) {
          // Do not retry policy refusals, exhausted quotas, or outages. Only
          // deployments explicitly lacking streaming receive a JSON fallback.
          if (!/stream.{0,35}(unsupported|not supported)|unsupported.{0,35}stream/i.test(String(error?.message || error))) throw error;
          result = await env.AI.run(MODEL, params);
        }
        if (result && typeof result.getReader === "function") {
          // Forward Cloudflare SSE without buffering, preserving low CPU overhead.
          return new Response(publicAiStream(result), {
            status: 200,
            headers: {
              ...headers,
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-store, no-transform",
              "X-Content-Type-Options": "nosniff"
            }
          });
        }
      } else {
        result = await env.AI.run(MODEL, params);
      }
      if (isRefusal(result)) return json(publicError("blocked"), 422, headers);
      if (result?.error || result?.success === false) {
        const code = classifyFailure(result.error || result);
        return json(publicError(code), code === 'blocked' ? 422 : 503, headers);
      }
      const reply = result?.choices?.[0]?.message?.content ?? result?.response ?? "";
      if (typeof reply !== "string" || !reply.trim()) {
        return json(publicError("unavailable"), 502, headers);
      }
      return json({ reply: reply.trim().slice(0, 6000) }, 200, headers);
    } catch (error) {
      const code = classifyFailure(error);
      return json(publicError(code), code === 'blocked' ? 422 : 503, headers);
    }
  }
};
