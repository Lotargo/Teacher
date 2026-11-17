const KEY = 'aga:Teacher-:pix-greeting-shown:v1';
/** Claim the welcome notification once per tab, across real HTML navigations.
 * If storage is blocked, do not repeatedly notify on every page. */
export function claimGreeting(storage) {
  try {
    const store = storage ?? window.sessionStorage;
    if (store.getItem(KEY) === '1') return false;
    store.setItem(KEY, '1');
    return true;
  } catch { return false; }
}
