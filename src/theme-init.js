/* Runs synchronously in <head> on every page. Only a local UI preference. */
(() => {
  const key = 'aga-theme', root = document.documentElement;
  const system = matchMedia('(prefers-color-scheme: dark)');
  let choice = null;
  const read = () => { try { const value = localStorage.getItem(key); return ['dark','light'].includes(value) ? value : null; } catch { return null; } };
  function apply() {
    const value = choice || (system.matches ? 'dark' : 'light');
    root.dataset.theme = value;
    root.style.colorScheme = value;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', value === 'dark' ? '#171f26' : '#f8f6ee');
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      const dark = value === 'dark';
      button.hidden = false;
      button.setAttribute('aria-pressed', String(dark));
      button.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
      button.title = button.getAttribute('aria-label');
      button.querySelector('[data-theme-icon]').textContent = dark ? '☀' : '☾';
    });
    dispatchEvent(new CustomEvent('aga:theme', { detail:{theme:value} }));
  }
  choice = read(); apply();
  document.addEventListener('DOMContentLoaded', apply, {once:true});
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-theme-toggle]')) return;
    choice = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(key, choice); } catch { /* The current page still works. */ }
    apply();
  });
  system.addEventListener('change', () => { if (!choice) apply(); });
  addEventListener('storage', event => { if (!event.key || event.key === key) { choice = read(); apply(); } });
  addEventListener('pageshow', () => { choice = read(); apply(); });
})();
