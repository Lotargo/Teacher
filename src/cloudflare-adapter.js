import { PixieError, classifyFailure, isRefusal } from './pix-errors.js';
import { CLOUDFLARE_CHAT_URL } from "./cloudflare-config.js";

const MAX_REPLY = 6000;

/** Parse Cloudflare SSE chunks, selecting only assistant text (never reasoning). */
export async function readCloudflareStream(body, onDelta = () => {}) {
  if (!body || typeof body.getReader !== "function") {
    throw new PixieError("unavailable");
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
    catch { throw new PixieError("unavailable"); }
    if (packet?.error) throw new PixieError(classifyFailure(packet.error));
    if (isRefusal(packet)) throw new PixieError("blocked");
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
      if (buffer.length > 30000) throw new PixieError("unavailable");
    }
  } finally {
    if (!complete || reply.length >= MAX_REPLY) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  if (!complete && reply.length < MAX_REPLY) throw new PixieError("interrupted");
  if (!reply.trim()) throw new PixieError("unavailable");
  return reply.trim();
}

/** Browser side. Secret is supplied by owner only; never embedded in static files. */
export async function askCloudflare(messages, {
  page = "home", ownerToken = "", turnstileToken = "",
  onDelta = () => {}, signal, fetcher = fetch
} = {}) {
  if (!ownerToken && !turnstileToken) throw new PixieError("verification");
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
    throw new PixieError("network");
  }
  if (!response.ok) {
    let data;
    try { data = await response.json(); } catch { /* Proxy HTML is not UI copy. */ }
    // Only our stable codes are accepted; arbitrary provider text never escapes.
    const known = data?.error?.code;
    const fallback = {401:'verification',403:'verification',413:'too_long',429:'rate_limit'};
    const code = known && ['blocked','unavailable','verification','rate_limit','quota','timeout','too_long','interrupted'].includes(known)
      ? known : fallback[response.status] || 'unavailable';
    throw new PixieError(code);
  }
  const contentType = response.headers.get("Content-Type")?.toLowerCase() || "";
  if (contentType.includes("text/event-stream")) {
    try { return await readCloudflareStream(response.body, onDelta); }
    catch (error) {
      if (error?.name === 'AbortError' || error instanceof PixieError) throw error;
      throw new PixieError('interrupted');
    }
  }
  let data;
  try { data = await response.json(); }
  catch { throw new PixieError("unavailable"); }
  if (isRefusal(data)) throw new PixieError("blocked");
  if (data?.error) throw new PixieError(classifyFailure(data.error));
  if (typeof data?.reply !== "string" || !data.reply.trim()) {
    throw new PixieError("unavailable");
  }
  const reply = data.reply.trim().slice(0, MAX_REPLY);
  onDelta(reply); // Smooth typewriter fallback for non-streaming responses.
  return reply;
}
