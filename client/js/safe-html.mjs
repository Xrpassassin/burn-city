// HTML escaping for on-chain strings (XRPL token/currency names, launchpad tickers) before they reach innerHTML.
// Token names are attacker-chosen: anyone can issue a currency whose code decodes to markup. See HANDOFF.md "Security hardening".
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
export const escapeHtml = s => String(s ?? '').replace(/[&<>"'`]/g, c => MAP[c]);
// Defense in depth at ingest: drop markup characters from a token name (keeps every legit name unchanged).
export const safeTokenName = s => typeof s === 'string' ? s.replace(/[<>&"'`\\]/g, '') : s;
// Neutralize names in window.ECO in place (nodes[].name and pools[].a/.b), consistently, so lookups by name still match.
export function neutralizeEcoNames(E) {
  if (!E || typeof E !== 'object') return E;
  for (const n of E.nodes || []) if (n && typeof n.name === 'string') n.name = safeTokenName(n.name);
  for (const p of E.pools || []) if (p) { if (typeof p.a === 'string') p.a = safeTokenName(p.a); if (typeof p.b === 'string') p.b = safeTokenName(p.b); }
  return E;
}
