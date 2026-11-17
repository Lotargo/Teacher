// PUBLIC configuration only. No PILOT_TOKEN, TURNSTILE_SECRET or API keys here.
export const CLOUDFLARE_CHAT_URL = "https://pixie-ai.etot-mir-realen3.workers.dev/chat";

// Optional public override for local demos. Normally left empty: the site fetches
// the real sitekey from the Worker GET /config after the visitor opts into AI.
export const TURNSTILE_SITE_KEY = "";
