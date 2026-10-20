// Server-side chat scam filter. Removes links/domains (incl. obfuscated + lookalike), r-addresses, seeds and seed phrases;
// blocks classic scam pitches. Allowlist: our own site and xrpburn.com. Strikes -> auto-mute.
const ALLOW = /^(?:www\.)?(?:xrpburn\.com|xrpassassin\.github\.io|burn-city-game\.fly\.dev)$/i;
// map common lookalikes to ASCII before matching (Cyrillic/Greek/fullwidth handled by NFKC + this table)
const LOOK = { 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'ɡ': 'g', 'ӏ': 'l', 'ο': 'o', 'α': 'a', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'ν': 'v', 'τ': 't', 'ρ': 'p', 'υ': 'u', '０': '0' };
const fold = s => s.normalize('NFKC').replace(/./gu, c => LOOK[c] || c);
const deob = s => fold(s).replace(/\s*[\[\(\{<]\s*(?:\.|dot|d0t)\s*[\]\)\}>]\s*/gi, '.').replace(/\s+(?:dot|d0t)\s+/gi, '.').replace(/hxxps?/gi, m => m.replace(/xx/i, 'tt'));
const TLD = '(?:com|net|org|io|app|xyz|co|me|gg|info|site|online|link|live|top|club|finance|fi|ai|pro|vip|cc|ly|to|tk|ml|ga|cf|gq|ru|cn|us|uk|de|xrp|claim|gift|bonus|dev|page|web|zone|world|cash|money|wallet|exchange|tech|store|shop|click|icu|biz|one|so|sh|in|eu)';
const URL_RE = new RegExp(`(?:[a-z][a-z0-9+.-]*:\\/\\/\\S+)|(?:www\\.\\S+)|(?:\\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9-]{1,63})*\\.${TLD}\\b(?:\\/\\S*)?)`, 'gi');
const RADDR = /\br[1-9A-HJ-NP-Za-km-z]{24,34}\b/g, XADDR = /\bX[1-9A-HJ-NP-Za-km-z]{46}\b/g;
const SEED = /\bs[1-9A-HJ-NP-Za-km-z]{25,34}\b|\bs[Ee]d[1-9A-HJ-NP-Za-km-z]{25,}\b/g;
const HEXKEY = /\b(?:0x)?[0-9a-fA-F]{60,}\b/g;
const PITCH = /(air\s*-?\s*drop|giveaway|give\s*away|free\s*(?:xrp|tokens?|nfts?|burn|money|coins?)|claim\s*(?:your|now|here|free|the|reward|xrp|tokens?|airdrop)|double\s*your|send\s*\d+.*(?:get|receive)\s*\d+|(?:support|admin|team|mod)\s*(?:will\s*)?(?:dm|pm|message)|(?:dm|pm|message)\s*(?:me|us)\s*(?:for|to)\s*(?:help|support|claim|verify|fix)|(?:verify|validate|sync|restore|connect)\s*(?:your\s*)?(?:wallet|seed|secret|keys?)|(?:your|enter|share|send)\s*(?:secret|seed|family\s*seed|recovery|private\s*key|mnemonic)|t\.me\/|telegram|whats\s*app|discord\.gg)/i;
const WORDS = 'abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual adapt add addict address adjust admit adult advance advice'.split(' ');
function phrase(s) {   // 12+ consecutive lowercase words of 3-8 letters (BIP39-like) = probably a seed phrase
  const w = s.toLowerCase().match(/\b[a-z]{3,8}\b/g) || []; let run = 0, best = 0; const t = s.toLowerCase().split(/\s+/);
  for (const x of t) { if (/^[a-z]{3,8}$/.test(x)) { run++; best = Math.max(best, run); } else run = 0; }
  return best >= 12 && w.some(x => WORDS.includes(x)) || best >= 20;
}
// returns { text, blocked, reasons[] }
function scrub(raw) {
  const reasons = []; let s = String(raw || '');
  const d = deob(s);
  if (PITCH.test(d)) return { text: '', blocked: true, reasons: ['scam_pitch'] };
  if (phrase(d)) return { text: '', blocked: true, reasons: ['seed_phrase'] };
  if (SEED.test(d) || HEXKEY.test(d)) { SEED.lastIndex = HEXKEY.lastIndex = 0; return { text: '', blocked: true, reasons: ['secret_like'] }; }
  // work on the de-obfuscated, folded text so lookalikes and [.] tricks can't survive
  let out = d.replace(URL_RE, m => { const host = m.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[\/?#:]/)[0].replace(/[.,!?)]+$/, ''); if (ALLOW.test(host)) return m; reasons.push('link'); return '[link removed]'; });
  out = out.replace(RADDR, () => (reasons.push('address'), '[address removed]')).replace(XADDR, () => (reasons.push('address'), '[address removed]'));
  return { text: reasons.length ? out : s, blocked: false, reasons };
}
// strikes: 3 removals/blocks in 30 min -> muted 1 h; 6 -> 24 h (in memory per wallet + per IP)
const strikes = new Map(), mutes = new Map();
function strike(key) { const t = Date.now(), a = (strikes.get(key) || []).filter(x => t - x < 1800e3); a.push(t); strikes.set(key, a);
  if (a.length >= 6) mutes.set(key, t + 86400e3); else if (a.length >= 3) mutes.set(key, t + 3600e3); }
const muted = key => (mutes.get(key) || 0) > Date.now();
module.exports = { scrub, strike, muted, deob };
