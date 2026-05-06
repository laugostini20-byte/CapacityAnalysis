'use strict';

// ─── API ─────────────────────────────────────────────────────────────────────
// HTTP helpers used by app.js. Loaded after state.js, before app.js.

// Cache-busting fetch wrapper that throws on non-2xx responses.
// All API GETs go through this so a server-side update reflects immediately
// in the UI on the next call (browsers occasionally cache aggressively).
async function apiFetch(url, opts = {}) {
  const sep = url.includes('?') ? '&' : '?';
  const bustUrl = url + sep + '_t=' + Date.now();
  const res = await fetch(bustUrl, { ...opts, cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}
