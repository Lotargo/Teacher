/** Keep the draggable panel inside the viewport, including after resize. */
export function clampPosition(left, top, width, height, viewportWidth, viewportHeight, gap = 10) {
  return {
    left:Math.min(Math.max(gap, left), Math.max(gap, viewportWidth - width - gap)),
    top:Math.min(Math.max(gap, top), Math.max(gap, viewportHeight - height - gap))
  };
}

/** Native SSE arrives incrementally; a full JSON response uses the same local reveal. */
export function createTextPresenter(node, { signal, onRender = () => {}, cps = 180 } = {}) {
  let target = '', shown = 0, frame = 0, last = 0, credit = 0, resolveFinish = null, rejectFinish = null, stopped = false;
  const reduce = () => document.hidden || document.body.classList.contains('still') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function complete() { resolveFinish?.(); resolveFinish = null; rejectFinish = null; }
  function render(now) {
    frame = 0; if (stopped) return;
    credit += Math.min(100, now - (last || now)) * cps / 1000; last = now;
    const count = Math.floor(credit); credit -= count;
    shown = reduce() ? target.length : Math.min(target.length, shown + count);
    // Do not expose a half surrogate pair at the cursor.
    if (shown < target.length && /[\uD800-\uDBFF]/.test(target.charAt(shown - 1))) shown++;
    node.textContent = target.slice(0, shown); onRender();
    if (shown < target.length) frame = requestAnimationFrame(render); else { last = 0; complete(); }
  }
  function schedule() {
    if (reduce()) { shown = target.length; node.textContent = target; onRender(); complete(); }
    else if (!frame) frame = requestAnimationFrame(render);
  }
  function onAbort() {
    stopped = true; cancelAnimationFrame(frame); frame = 0;
    rejectFinish?.(new DOMException('Cancelled', 'AbortError')); resolveFinish = null; rejectFinish = null;
  }
  function onVisibility() { if (document.hidden && !stopped) { cancelAnimationFrame(frame); frame = 0; schedule(); } }
  signal?.addEventListener('abort', onAbort, { once:true });
  document.addEventListener('visibilitychange', onVisibility);
  return {
    push(part) { signal?.throwIfAborted(); if (!stopped) { target += part; schedule(); } },
    finish() {
      signal?.throwIfAborted();
      if (shown >= target.length) return Promise.resolve();
      return new Promise((resolve, reject) => { resolveFinish = resolve; rejectFinish = reject; schedule(); });
    },
    stop() {
      stopped = true; cancelAnimationFrame(frame); complete();
      signal?.removeEventListener('abort', onAbort); document.removeEventListener('visibilitychange', onVisibility);
    }
  };
}
