// Per-wallet activity: ranked entries, prizes, refunds, shop purchases and the burn share of each. Public ledger data only.
const fs = require('fs'), S = require('./store'), Q = require('./payq'), Pay = require('./payments');
const ACCT = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
function lines(n) { try { return fs.readFileSync(S.file(n), 'utf8').trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } }
function forAcct(acct, { before = Infinity, limit = 25 } = {}) {
  if (!ACCT.test(acct)) return { error: 'bad_address' };
  limit = Math.max(1, Math.min(50, limit | 0 || 25)); before = +before || Infinity;
  const ev = [];
  for (const e of S.load('ranked_entries.json', [])) if (e.account === acct) ev.push({ t: e.t, kind: 'entry', match: e.match, xrp: e.drops / 1e6, burnXrp: (e.burn || 0) / 1e6, status: 'verified', hash: e.hash });
  for (const r of Q.db.prepare('SELECT kind,match,drops,status,hash,created,updated FROM payq WHERE dest=?').all(acct))
    ev.push({ t: r.created, kind: r.kind, match: r.match, xrp: r.drops / 1e6, status: r.status === 'held' ? 'under_review' : r.status, hash: r.status === 'paid' || r.status === 'submitted' ? r.hash : null });
  for (const s of lines('sales.jsonl')) if (s.account === acct) ev.push({ t: s.t, kind: 'shop', item: s.item, xrp: s.drops / 1e6, burnXrp: (s.burnDrops || 0) / 1e6, status: 'verified', hash: s.txHash });
  const all = ev.filter(e => e.t < before).sort((a, b) => b.t - a.t), page = all.slice(0, limit);
  const tot = k => +ev.filter(e => e.kind === k && (k === 'entry' || k === 'shop' || e.status === 'paid')).reduce((a, e) => a + e.xrp, 0).toFixed(6);
  return { acct, items: page, next: all.length > limit ? page.at(-1).t : null,
    totals: { entriesXrp: tot('entry'), prizesXrp: tot('prize'), refundsXrp: tot('refund'), shopXrp: tot('shop'), burnedXrp: +ev.reduce((a, e) => a + (e.burnXrp || 0), 0).toFixed(6) }, owned: Pay.owned(acct) };
}
module.exports = { forAcct };
