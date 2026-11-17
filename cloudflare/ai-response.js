import { classifyFailure, isRefusal } from '../src/pix-errors.js';

/** Normalize upstream SSE. No model names, stack traces, reasoning, tool payloads,
 * or raw provider failures are sent to visitors. Backpressure/cancel propagate. */
export function publicAiStream(upstream) {
  const encoder = new TextEncoder(), decoder = new TextDecoder();
  let buffer = '', ended = false, count = 0, terminal = false;
  function emit(controller, value) {
    controller.enqueue(encoder.encode('data: ' + (typeof value === 'string' ? value : JSON.stringify(value)) + '\n\n'));
  }
  function finish(controller, code = '') {
    if (ended) return;
    if (code) emit(controller, { error: { code } });
    emit(controller, '[DONE]'); ended = true;
  }
  function event(raw, controller) {
    if (ended) return;
    const data = raw.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data) return;
    if (data === '[DONE]') { finish(controller, count ? '' : 'unavailable'); return; }
    let packet;
    try { packet = JSON.parse(data); } catch { finish(controller, 'unavailable'); return; }
    if (packet?.error || packet?.success === false) { finish(controller, classifyFailure(packet.error || packet)); return; }
    if (isRefusal(packet)) { finish(controller, 'blocked'); return; }
    const choice = packet?.choices?.[0];
    const text = choice?.delta?.content ?? packet?.response;
    if (typeof text === 'string' && text) {
      const addition = text.slice(0, 6000 - count); count += addition.length;
      if (addition) emit(controller, { choices: [{ delta: { content: addition } }] });
      if (count >= 6000) finish(controller);
    }
    if (choice?.finish_reason) terminal = true;
  }
  const transform = new TransformStream({
    transform(chunk, controller) {
      if (ended) { controller.terminate(); return; }
      buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, {stream:true});
      let match;
      while (!ended && (match = /\r?\n\r?\n/.exec(buffer))) {
        event(buffer.slice(0,match.index), controller);
        buffer = buffer.slice(match.index + match[0].length);
      }
      if (buffer.length > 64000) finish(controller, 'unavailable');
      if (ended) controller.terminate();
    },
    flush(controller) {
      buffer += decoder.decode();
      if (!ended && buffer.trim()) event(buffer, controller);
      if (!ended) finish(controller, terminal && count ? '' : 'interrupted');
    }
  });
  return upstream.pipeThrough(transform);
}
export function publicError(code) { return { error: { code } }; }
