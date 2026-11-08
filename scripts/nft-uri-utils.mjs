// Safe helpers for interpreting XRPL NFT URI fields and validating source URLs.
export function decodeNftUri(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw.startsWith('ipfs://') || /^https?:\/\//i.test(raw)) return raw;
  if (!/^(?:[0-9a-f]{2})+$/i.test(raw)) return raw;
  try {
    const decoded = Buffer.from(raw, 'hex').toString('utf8');
    return decoded && !decoded.includes('\uFFFD') ? decoded.trim() : raw;
  } catch { return raw; }
}

export function safeUrl(value) {
  const raw = String(value ?? '').trim();
  if (/^ipfs:\/\//i.test(raw)) return raw;
  try {
    const u = new URL(raw);
    return ['https:', 'http:'].includes(u.protocol) ? u.toString() : '';
  } catch { return ''; }
}
