// Free weekly skill leaderboard (zombie survival). Only server-observed kills count.
// Prizes are paid manually from a separate prize wallet; this module only PREPARES the payout list.
const C = require('./config'), S = require('./store');
const week = (d = new Date()) => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y) / 864e5 + 1) / 7)).padStart(2, '0')}`; };
const MAX_KPM = +(process.env.FLAG_KILLS_PER_MIN || 30), MAX_RUNS_PER_HOUR = +(process.env.FLAG_RUNS_PER_HOUR || 40);

// result of one life: {acct, kills, wave, secs}
function record(r) {
  if (!r.acct || r.secs < 5) return;
  const wk = week(), file = `lb_${wk}.json`, lb = S.load(file, {}), e = lb[r.acct] || { kills: 0, best: 0, runs: 0, secs: 0, flags: [], recent: [] };
  const score = r.kills * 10 + r.wave * 25;
  e.kills += r.kills; e.best = Math.max(e.best, score); e.runs++; e.secs += r.secs;
  e.recent = [...e.recent.filter(t => Date.now() - t < 3600e3), Date.now()];
  const kpm = r.kills / (r.secs / 60);
  if (kpm > MAX_KPM) e.flags.push(`kpm ${kpm.toFixed(1)} @${new Date().toISOString()}`);
  if (e.recent.length > MAX_RUNS_PER_HOUR) e.flags.push(`runs/h ${e.recent.length}`);
  if (r.kills > 6 * r.wave + 2 * r.wave * (r.wave + 1)) e.flags.push(`kills>spawned wave ${r.wave}`);   // impossible: more kills than zombies spawned
  e.flags = e.flags.slice(-20); lb[r.acct] = e; S.save(file, lb);
}
function top(wk = week(), n = 10) {
  const lb = S.load(`lb_${wk}.json`, {});
  return Object.entries(lb).map(([acct, e]) => ({ acct, kills: e.kills, best: e.best, runs: e.runs, minutes: Math.round(e.secs / 60), flagged: e.flags.length > 0, flags: e.flags }))
    .sort((a, b) => b.kills - a.kills || b.best - a.best).slice(0, n);
}
const curHex = c => c.length === 3 ? c : Buffer.from(c).toString('hex').toUpperCase().padEnd(40, '0');
// Admin-only: prize list + trustline check + UNSIGNED payment JSON. Nothing is signed or sent here.
async function payoutList(client, wk = week()) {
  const prizes = C.PRIZES.split(',').map(Number), IMG = { currency: curHex(C.IMG_CURRENCY), issuer: C.IMG_ISSUER };
  const winners = top(wk, 50).filter(w => !w.flagged).slice(0, prizes.length), out = [];
  for (const [i, w] of winners.entries()) {
    let trust = false, note;
    try { const l = (await client.request({ command: 'account_lines', account: w.acct, peer: C.IMG_ISSUER })).result.lines;
      const line = l.find(x => x.currency === IMG.currency || x.currency === C.IMG_CURRENCY);
      trust = !!line && +line.limit - +line.balance >= prizes[i]; if (line && !trust) note = 'trustline limit too low'; }
    catch (e) { note = e.data?.error === 'actNotFound' ? 'account not found' : e.message; }
    out.push({ rank: i + 1, ...w, prizeIMG: prizes[i], trustline: trust,
      action: trust ? 'ready for manual approval' : `HOLD: ${note || 'no IMG trustline'} — ask winner to add IMG trustline, prize held for next payout run`,
      unsignedTx: trust ? { TransactionType: 'Payment', Account: C.PRIZE_WALLET, Destination: w.acct, Amount: { ...IMG, value: String(prizes[i]) } } : null });
  }
  return { week: wk, note: 'Flagged accounts excluded pending manual review. Nothing has been sent.', flaggedForReview: top(wk, 50).filter(w => w.flagged), payouts: out };
}
module.exports = { record, top, payoutList, week };
