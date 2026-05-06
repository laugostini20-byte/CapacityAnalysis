'use strict';

// ─── UTILS ───────────────────────────────────────────────────────────────────
// Pure helper functions used across the front-end. Loaded after constants.js
// (uses VIEW_SCALE and INDYSOFT_LABS) but before app.js.

// Current fiscal year start year (e.g. 2025 for FY 2025-26).
// FY rolls over in April, so months Apr-Dec belong to the year that started this calendar year.
function currentFYStartYear() {
  const now = new Date();
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

// Lowercase + strip non-alphanumerics → canonical key for a lab name.
function labKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

// HTML-escape a string for safe interpolation into innerHTML.
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Format a number with thousands separators and a fixed number of decimals.
function fmt(n, dec = 1) {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// Format an integer with thousands separators (no decimals).
function fmtInt(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('en-US');
}

// Format a signed number with explicit + or − sign and thousands separators.
function fmtSgn(n, dec = 1) {
  if (n == null || !Number.isFinite(n)) return '—';
  const s = fmt(Math.abs(n), dec);
  return n >= 0 ? '+' + s : '−' + s;
}

// Clamp n into [min, max].
function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

// Period scale factor. weekly=1, monthly=4.33, quarterly=12.99, yearly=51.96
function scale(view) { return VIEW_SCALE[view] ?? 1; }

// Is this lab tracked in IndySoft (vs CalTrak)?
function isIndySoft(labName) { return INDYSOFT_LABS.has(labName); }
