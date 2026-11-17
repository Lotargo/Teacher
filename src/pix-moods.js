/** Cropped from the user-supplied sheet. No AI request is involved in any pose. */
export const EXPRESSIONS = Object.freeze([
  'wave','thinking','idea','guide','help',
  'fix','reading','writing','coffee','cheer',
  'surprised','error','care','save','relax',
  'idle-a','idle-b','idle-c','idle-d','idle-e'
]);
const EVENT_POSES = Object.freeze({ thinking:'thinking', typing:'writing', idea:'idea', error:'error', guide:'care', unread:'help' });
const IDLE_POSES = Object.freeze(['wave','reading','coffee','cheer','care','save','relax','idle-a','idle-b','idle-c','idle-d','idle-e']);
const fraction = value => Number.isFinite(value) ? Math.min(.999999, Math.max(0, value)) : .5;
export function spritePosition(name) {
  const index = EXPRESSIONS.indexOf(name);
  return index < 0 ? null : { x:(index % 5) * 25, y:Math.floor(index / 5) * (100 / 3) };
}
export function nextIdleExpression(previous, random = Math.random) {
  const choices = IDLE_POSES.filter(name => name !== previous);
  return choices[Math.floor(fraction(random()) * choices.length)];
}

/** Injectable clock makes idle/priority/suspension behaviour deterministic in tests. */
export function createMoodController(onChange, {
  random = Math.random, later = setTimeout, cancel = clearTimeout,
  idleMin = 24000, idleMax = 48000, linger = 6500, greetingTime = 7000
} = {}) {
  let activity = 'hello', unread = 0, intro = false, idlePose = null;
  let paused = false, destroyed = false, previousPose = null, lastIdlePose = null, lastKey = '';
  const timers = {};
  const busy = () => activity === 'thinking' || activity === 'typing';
  function clear(name) { if (timers[name] !== undefined) { cancel(timers[name]); delete timers[name]; } }
  function after(name, delay, action) {
    clear(name);
    timers[name] = later(() => { delete timers[name]; if (!destroyed) action(); }, delay);
  }
  function render() {
    if (destroyed) return;
    let state = activity, expression = EVENT_POSES[activity] || null;
    if (!busy() && activity !== 'error') {
      if (idlePose) { state = 'idle'; expression = idlePose; }
      else if (unread > 0 && !intro) { state = 'unread'; expression = EVENT_POSES.unread; }
    }
    const key = state + ':' + expression;
    if (key !== lastKey) { lastKey = key; previousPose = expression; onChange(state, expression); }
  }
  function scheduleIdle() {
    clear('idle');
    if (destroyed || paused || busy() || activity === 'error') return;
    after('idle', idleMin + fraction(random()) * (idleMax - idleMin), () => {
      if (paused || busy()) return;
      idlePose = nextIdleExpression(lastIdlePose || previousPose, random); lastIdlePose = idlePose; render();
      after('revert', linger, () => { idlePose = null; render(); scheduleIdle(); });
    });
  }
  function scheduleIntro() {
    clear('intro');
    if (intro && !paused) after('intro', greetingTime, () => { intro = false; render(); });
  }
  function settleLater() {
    clear('settle');
    if (!paused && ['idea','error','guide'].includes(activity)) {
      after('settle', linger, () => { activity = 'hello'; render(); scheduleIdle(); });
    }
  }
  render(); scheduleIdle();
  return {
    setActivity(next) {
      if (destroyed) return;
      activity = next === 'hello' || Object.hasOwn(EVENT_POSES, next) ? next : 'hello';
      intro = false; idlePose = null;
      ['intro','idle','revert','settle'].forEach(clear);
      render(); settleLater(); scheduleIdle();
    },
    setUnread(count, { initial = false } = {}) {
      if (destroyed) return;
      unread = Math.max(0, Number(count) || 0);
      intro = initial && unread > 0;
      if (!initial) { idlePose = null; clear('revert'); }
      scheduleIntro(); render(); scheduleIdle();
    },
    pause() {
      if (paused || destroyed) return;
      paused = true; Object.keys(timers).forEach(clear); idlePose = null; render();
    },
    resume() {
      if (destroyed || !paused) return;
      paused = false; render(); scheduleIntro(); settleLater(); scheduleIdle();
    },
    dispose() { destroyed = true; Object.keys(timers).forEach(clear); },
  };
}
