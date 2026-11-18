const KEY = 'aga:Teacher:pix-greeting-shown:v1';
const LEGACY_KEY = 'aga:Teacher-:pix-greeting-shown:v1';
/** Claim the welcome notification once per tab, across real HTML navigations.
 * If storage is blocked, do not repeatedly notify on every page. */
export function claimGreeting(storage) {
  try {
    const store = storage ?? window.sessionStorage;
    if (store.getItem(KEY) === '1') return false;
    const alreadyClaimed = store.getItem(LEGACY_KEY) === '1';
    store.setItem(KEY, '1');
    if (alreadyClaimed) store.removeItem(LEGACY_KEY);
    return !alreadyClaimed;
  } catch { return false; }
}
