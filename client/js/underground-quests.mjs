// The Ledger of Deeds (quest board in the Undercroft): daily + weekly Eternal Grind objectives.
// LOCAL ONLY: progress is read (never written) from Eternal Grind's own save (localStorage.egSave) and compared with a snapshot
// this board keeps under its own key. Nothing here touches the Eternal Grind save format, awards items, gold or anything of value:
// finishing a deed is bragging rights on this device. Pure functions, testable in node.
export const STORE_KEY = 'bcUndercroftDeeds';
export const DAILY = [
  { id: 'd-deeper', metric: 'best', n: 2, text: 'Push 2 floors past your deepest descent' },
  { id: 'd-level', metric: 'lvl', n: 1, text: 'Gain a level in the Eternal Grind' },
  { id: 'd-codex', metric: 'codex', n: 2, text: 'Record 2 new foes in your codex' },
  { id: 'd-ore', metric: 'ore', n: 6, text: 'Haul 6 ore out of the depths' },
  { id: 'd-gold', metric: 'gold', n: 150, text: 'Come back 150 gold richer' },
  { id: 'd-shard', metric: 'shard', n: 2, text: 'Recover 2 ember shards' },
];
export const WEEKLY = [
  { id: 'w-deeper', metric: 'best', n: 6, text: 'Break 6 floors past your deepest this week' },
  { id: 'w-level', metric: 'lvl', n: 3, text: 'Gain 3 levels this week' },
  { id: 'w-codex', metric: 'codex', n: 6, text: 'Record 6 new foes this week' },
  { id: 'w-ore', metric: 'ore', n: 30, text: 'Haul 30 ore this week' },
  { id: 'w-gold', metric: 'gold', n: 1000, text: 'Bank 1,000 gold this week' },
];
const pad = n => String(n).padStart(2, '0');
export function dayKey(d = new Date()) { return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
export function weekKey(d = new Date()) {   // ISO-8601 week, UTC
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return `${t.getUTCFullYear()}-W${pad(Math.ceil(((t - y0) / 864e5 + 1) / 7))}`;
}
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function pick(pool, key, n) {   // deterministic, distinct
  const a = pool.slice(), out = []; let h = hash(key);
  while (out.length < n && a.length) { h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; out.push(a.splice(h % a.length, 1)[0]); }
  return out;
}
// Read-only view of the Eternal Grind save: only finite numbers, nothing else is kept.
export function metricsFrom(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let s; try { s = JSON.parse(raw); } catch { return null; }
  if (!s || typeof s !== 'object') return null;
  const f = v => (typeof v === 'number' && isFinite(v) ? v : 0);
  return { name: typeof s.name === 'string' ? s.name.slice(0, 24) : '', lvl: f(s.lvl), best: f(s.best), gold: f(s.gold), codex: Array.isArray(s.codex) ? s.codex.length : 0, ore: f(s.mats && s.mats.ore), shard: f(s.mats && s.mats.shard) };
}
// state: the board's own stored object (or null). Returns { state (to store), daily: [...], weekly: [...], hasChar }.
export function board(state, egRaw, now = new Date()) {
  const m = metricsFrom(egRaw), dk = dayKey(now), wk = weekKey(now);
  const st = state && typeof state === 'object' ? { ...state } : {};
  if (m) {
    if (!st.daily || st.daily.key !== dk || st.daily.who !== m.name) st.daily = { key: dk, who: m.name, base: m };
    if (!st.weekly || st.weekly.key !== wk || st.weekly.who !== m.name) st.weekly = { key: wk, who: m.name, base: m };
  }
  const rows = (list, slot) => list.map(q => {
    const base = slot && slot.base ? slot.base[q.metric] || 0 : 0, cur = m ? m[q.metric] || 0 : 0, got = Math.max(0, Math.min(q.n, cur - base));
    return { id: q.id, text: q.text, n: q.n, got, done: !!m && got >= q.n };
  });
  return { state: st, hasChar: !!m, name: m ? m.name : '', dayKey: dk, weekKey: wk, daily: rows(pick(DAILY, 'd' + dk, 3), st.daily), weekly: rows(pick(WEEKLY, 'w' + wk, 3), st.weekly) };
}
