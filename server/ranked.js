// Optional paid "Ranked" Zombie Survival, PER-MATCH pots. Free mode is untouched.
// Flow: player pays entry (own XAMAN signature) -> ticket -> joins ranked lobby -> match starts with >= MIN players ->
// one life each, server counts kills -> pot = entries of THIS match; BURN_PCT burned, network fees reserved from the pot,
// rest split 50/30/20 to top 3 by kills. Admin reviews + approves every match payout. Tickets are only consumed when a
// match actually starts; unused tickets are refundable (see refunds()).
// Entry: RANKED_ENTRY_DROPS per run (0.2 XRP), paid by the player signing their OWN XAMAN payment to TREASURY with a
// unique DestinationTag + memo. Server verifies the validated payment on-ledger, then issues a one-time run ticket.
// 3.22% of every entry is owed to the batched BURN job; the rest is the weekly pool. Top 3 split 50/30/20.
// Prizes come ONLY from collected entries minus a fee buffer -> the project can never pay out more than it took in.
// Payouts: admin-approved, one by one. DRY_RUN (default) never submits anything.
const crypto = require('crypto'), C = require('./config'), S = require('./store');
const E = process.env;
const R = {
  ENTRY: +(E.RANKED_ENTRY_DROPS || 200000), BURN: Math.min(1, Math.max(0, Number.isFinite(+E.BURN_PCT) && E.BURN_PCT !== '' && E.BURN_PCT !== undefined ? +E.BURN_PCT : 3.22) / 100), SPLIT: [0.5, 0.3, 0.2],
  BUFFER: +(E.RANKED_FEE_BUFFER_DROPS || 100000),      // kept back each week for tx fees/reserve wiggle
  LIVE: E.RANKED_LIVE === 'true', MAX_PER_HOUR: +(E.RANKED_MAX_RUNS_PER_HOUR || 12), TICKET_TTL: +(E.RANKED_TICKET_HOURS || 24) * 3600e3,
  MINB: Math.round(+(E.MIN_BUYIN || 0.2) * 1e6), MAXB: Math.round(+(E.MAX_BUYIN || 25) * 1e6), LOBBY_TTL: +(E.RANKED_LOBBY_MINUTES || 30) * 60e3,
  MIN: +(E.RANKED_MIN_PLAYERS || 1), MAX: +(E.RANKED_MAX_PLAYERS || 8), FEE: +(E.RANKED_FEE_DROPS || 100),   // per-tx fee reserve (network fee is ~12 drops; 100 is generous)
};
const live = () => R.LIVE && !!C.TREASURY && !!C.XUMM_KEY;
const status = () => live() ? (C.DRY_RUN ? 'live_dry_run' : 'live') : 'coming_soon';
// weeks: America/Phoenix (UTC-7, no DST), Monday 00:00 -> next Monday 00:00
const PHX = 7 * 3600e3;
function weekStart(ms = Date.now()) { const d = new Date(ms - PHX), day = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day) + PHX; }
const weekKey = (ms = Date.now()) => new Date(weekStart(ms) - PHX).toISOString().slice(0, 10);   // Monday date, Phoenix
const lobbies = S.load('ranked_lobbies.json', {});   // id -> {id, buyin, creator, created, paid:[acct], state:'open'|'started'|'expired'}
const saveL = () => S.save('ranked_lobbies.json', lobbies);
function openLobbies() { const now = Date.now(); for (const l of Object.values(lobbies)) if (l.state === 'open' && now - l.created > R.LOBBY_TTL) l.state = 'expired';
  return Object.values(lobbies).filter(l => l.state === 'open'); }
const sessions = new Map(Object.entries(S.load('ranked_sessions.json', {}))), tickets = S.load('ranked_tickets.json', {}), usedTx = new Set(S.load('ranked_used_tx.json', []));
const hex = s => Buffer.from(s, 'utf8').toString('hex').toUpperCase();
const saveS = () => S.save('ranked_sessions.json', Object.fromEntries(sessions));
function newTag() { const used = new Set([...sessions.values()].map(s => s.tag)); let t; do t = 100000 + crypto.randomInt(4e9); while (used.has(t)); return t; }
function recent(acct) { const h = S.load('ranked_entries.json', []); return h.filter(e => e.account === acct && Date.now() - e.t < 3600e3).length; }
// opts: {create: true, buyinXrp} to open a new match, or {match: id} to join an open one
const cleanCfg = (game, c = {}) => game === 'tron' ? { teams: [0, 2, 3, 4].includes(+c.teams) ? +c.teams : 0, ff: c.ff !== false && c.ff !== 'false' && c.ff !== 0, bo3: !!c.bo3 && c.bo3 !== 'false' } : {};
function enter(acct, opts = {}) {
  if (!live()) return { error: 'ranked_coming_soon' };
  for (const [k, s] of sessions) if (Date.now() - s.created > (s.uuid && !s.done ? 120 : 15) * 60e3) sessions.delete(k);
  if ([...sessions.values()].some(s => s.account === acct && !s.done)) return { error: 'entry_already_pending' };
  if (Object.values(tickets).some(t => t.account === acct && !t.used && !t.left && !t.refunded && t.exp > Date.now() && lobbies[t.match]?.state === 'open')) return { error: 'you_are_already_in_an_open_match' };
  if (recent(acct) >= R.MAX_PER_HOUR) return { error: 'rate_limited' };
  let match, buyin;
  if (opts.create) { buyin = Math.round(+opts.buyinXrp * 1e6); if (!(buyin >= R.MINB && buyin <= R.MAXB)) return { error: `buyin_must_be_${R.MINB / 1e6}_to_${R.MAXB / 1e6}_XRP` };
    match = 'M' + crypto.randomBytes(5).toString('hex'); }
  else { const l = openLobbies().find(x => x.id === opts.match); if (!l) return { error: 'match_not_open' }; if (l.paid.includes(acct)) return { error: 'already_joined' };
    if (l.paid.length >= R.MAX) return { error: 'match_full' }; match = l.id; buyin = l.buyin; }
  const game = opts.create ? (opts.game === 'tron' ? 'tron' : 'zombie') : null, cfg = opts.create ? cleanCfg(game, opts.cfg) : null;
  const sid = 'RK' + crypto.randomBytes(12).toString('hex'), tag = newTag();
  sessions.set(sid, { created: Date.now(), account: acct, tag, match, buyin, create: !!opts.create, game, cfg }); saveS();
  return { sid, tag, match, buyinXrp: buyin / 1e6, tx: txJson(sid) };
}
const txJson = sid => { const s = sessions.get(sid); return { TransactionType: 'Payment', Account: s.account, Destination: C.TREASURY, DestinationTag: s.tag, Amount: String(s.buyin),
  Memos: [{ Memo: { MemoType: hex('burncity/ranked'), MemoData: hex(sid) } }] }; };
async function xamanPayload(sid, sdk) { const s0 = () => sessions.get(sid);   // the PLAYER signs in XAMAN; the server never signs entries
  const p = await sdk().payload.create({ txjson: txJson(sid), options: { submit: true, expire: 10 },
    custom_meta: { identifier: sid, instruction: `Burn City Ranked ${s0().game === 'tron' || lobbies[s0().match]?.game === 'tron' ? 'Light Cycles' : 'Zombie'} match ${s0().match} buy-in (${s0().buyin / 1e6} XRP). Skill-based: most kills wins.${R.BURN > 0 ? ` ${+(R.BURN * 100).toFixed(4)}% burned as BURN,` : ''} rest to this match's pot.` } });
  sessions.get(sid).uuid = p.uuid; saveS(); return { uuid: p.uuid, qr: p.refs.qr_png, deeplink: p.next.always };
}
async function verify(sid, ledger, sdk, acct) {
  const s = sessions.get(sid); if (!s) return { ok: false, reason: 'unknown_or_expired_session' };
  if (acct && acct !== s.account) return { ok: false, reason: 'not_your_session' };
  if (s.done) return { ok: true, ticket: s.ticket, match: s.match, hash: s.hash };
  let h = s.hash || null; if (!h && s.uuid && sdk) { const p = await sdk().payload.get(s.uuid); h = p?.meta?.signed ? p.response.txid : null; }
  if (!/^[0-9A-F]{64}$/i.test(h || '')) return { ok: false, reason: 'no_tx' }; h = h.toUpperCase();
  if (usedTx.has(h)) return { ok: false, reason: 'replay' };
  let r; try { r = (await (await ledger()).request({ command: 'tx', transaction: h })).result; } catch { return { ok: false, reason: 'tx_not_found' }; }
  const v = check(r, s, sid); if (!v.ok) return v;
  if (usedTx.has(h) || s.done) return s.done ? { ok: true, ticket: s.ticket } : { ok: false, reason: 'replay' };   // re-check after the await: concurrent verifies of one tx
  usedTx.add(h); S.save('ranked_used_tx.json', [...usedTx]); return credit(s, sid, h, v.drops);
}
function check(r, s, sid) {     // pure ledger truth
  const tx = r.tx_json || r, m = r.meta;
  if (!r.validated) return { ok: false, reason: 'not_validated_yet' };
  if (tx.TransactionType !== 'Payment' || m?.TransactionResult !== 'tesSUCCESS') return { ok: false, reason: 'tx_failed' };
  if (tx.Destination !== C.TREASURY || tx.DestinationTag !== s.tag) return { ok: false, reason: 'wrong_destination_or_tag' };
  if (tx.Account !== s.account) return { ok: false, reason: 'wrong_sender' };
  const d = m.delivered_amount; if (typeof d !== 'string' || +d < s.buyin) return { ok: false, reason: 'wrong_amount' };
  if (!(tx.Memos || []).some(x => Buffer.from(x.Memo.MemoData || '', 'hex').toString() === sid)) return { ok: false, reason: 'memo_mismatch' };
  return { ok: true, drops: s.buyin };   // only the buy-in counts; overpayment is not added to prizes
}
function credit(s, sid, hash, drops) {
  const burn = Math.floor(drops * R.BURN);   // burn is taken from every deposit, at deposit time
  if (burn > 0) { const o = S.load('burn_owed.json', { drops: 0 }); o.drops += burn; S.save('burn_owed.json', o); }
  const h = S.load('ranked_entries.json', []); h.push({ t: Date.now(), sid, hash, account: s.account, drops, burn, match: s.match }); S.save('ranked_entries.json', h.slice(-20000));
  if (s.create && !lobbies[s.match]) lobbies[s.match] = { id: s.match, game: s.game || 'zombie', cfg: s.cfg || {}, buyin: drops, creator: s.account, created: Date.now(), paid: [], state: 'open' };
  const l = lobbies[s.match] || { state: 'expired', created: 0, paid: [] }; if (l.state === 'open' && !l.paid.includes(s.account)) l.paid.push(s.account); saveL();
  const ticket = 'TK' + crypto.randomBytes(16).toString('hex');
  tickets[ticket] = { account: s.account, match: s.match, exp: l.created + R.LOBBY_TTL, used: false, sid, hash, drops, burn, paidAt: Date.now() }; S.save('ranked_tickets.json', tickets);
  s.done = true; s.ticket = ticket; s.hash = hash; saveS(); return { ok: true, ticket, match: s.match, hash, lobbyOpen: l.state === 'open' };
}
const ticketOk = (ticket, acct, match) => { const t = tickets[ticket]; return !!t && !t.left && !t.used && !t.refunded && t.exp > Date.now() && t.account === acct && (!match || t.match === match) && lobbies[t.match]?.state === 'open'; };
const ticketMatch = t => tickets[t]?.match;
// lobby screen: who has paid (confirmed on-ledger) and who has an entry still waiting for confirmation (masked handles only)
const maskA = a => a ? a.slice(0, 4) + '…' + a.slice(-3) : '';
function lobbyPay(id) { const l = lobbies[id]; if (!l) return { paid: [], pending: [] }; const pend = [...sessions.values()].filter(s => s.match === id && !s.done && Date.now() - (s.created || 0) < 15 * 60e3).map(s => s.account); return { paid: l.paid.slice(), pending: pend.filter(a => !l.paid.includes(a)) }; }
const reconOk = (rt, acct, lob) => { const t = rt && tickets[rt]; return !!(t && acct && lob && lob.state === 'started' && (lob.game || 'zombie') === 'zombie' && t.used && !t.refunded && t.account === acct && t.match === lob.id); };
function markStarted(id) { if (lobbies[id]) { lobbies[id].state = 'started'; lobbies[id].started = Date.now(); saveL(); } }
function useTicket(ticket, acct, matchId) {   // consumed only when the match actually starts
  if (!ticketOk(ticket, acct, matchId)) return false; const t = tickets[ticket]; t.used = Date.now(); S.save('ranked_tickets.json', tickets); return true;
}
// ---- match settlement + anti-cheat ----
const KPM_CAP = +(E.RANKED_MAX_KPM || 30);
function sanity(r) {
  const f = [];
  if (r.kills > r.spawned) f.push(`kills ${r.kills} > spawned ${r.spawned}`);
  if (r.secs > 0 && r.kills / (r.secs / 60) > KPM_CAP) f.push(`kpm ${(r.kills / (r.secs / 60)).toFixed(1)}`);
  if (r.wave > 1 && r.secs < (r.wave - 1) * 6) f.push(`wave ${r.wave} in ${Math.round(r.secs)}s`);
  return f;
}
// Deterministic order: kills desc -> survived longer -> paid earlier (ledger-verified entry time) -> account id.
const rankCmp = (a, b) => b.kills - a.kills || b.secs - a.secs || a.paidAt - b.paidAt || (a.acct < b.acct ? -1 : 1);
function split(potDrops, n) {   // potDrops = deposits after their burn
  const burn = 0, payTx = Math.min(3, n), fees = R.FEE * payTx;
  const prize = Math.max(0, potDrops - fees), shares = R.SPLIT.slice(0, payTx);
  const norm = shares.reduce((a, b) => a + b, 0) || 1;          // with exactly 3 players this is 50/30/20 as-is
  const amounts = shares.map(x => Math.floor(prize * x / norm));
  return { potDrops, burnDrops: burn, feeReserveDrops: fees + (prize - amounts.reduce((a, b) => a + b, 0)), prizeDrops: amounts.reduce((a, b) => a + b, 0), amounts };
}
// m: {id, players:[{acct, ticket, kills, secs, wave, spawned, paidAt}]}
function settle(m) {
  const mf = matchFlags(m.players, Math.max(0, ...m.players.map(p => p.secs)));
  const players = m.players.map(p => ({ ...p, kills: Math.min(p.kills, p.spawned), flags: [...sanity(p), ...(mf.get(p.acct) || [])] })).sort(rankCmp);
  const dep = players.reduce((a, p) => a + (tickets[p.ticket]?.drops || 0), 0), burned = players.reduce((a, p) => a + (tickets[p.ticket]?.burn || 0), 0), pot = dep - burned, sp = { ...split(pot, players.length), depositsDrops: dep, burnDrops: burned };
  const rec = { id: m.id, t: Date.now(), status: players.some(p => p.flags.length) ? 'held_for_review' : 'auto', dryRun: C.DRY_RUN,
    ...sp, standings: players.map((p, i) => ({ rank: i + 1, acct: p.acct, kills: p.kills, secs: Math.round(p.secs), wave: p.wave, flags: p.flags, prizeDrops: sp.amounts[i] || 0 })) };
  const all = S.load('ranked_matches.json', {}); all[m.id] = rec; S.save('ranked_matches.json', all);
  return autoPay(m.id);
}
// Shared ranked flags: several wallets from one IP in one match (possible multi-accounting / collusion), very short matches.
function matchFlags(players, secs) {
  const f = new Map(), byIp = new Map(); for (const p of players) if (p.ip) byIp.set(p.ip, [...(byIp.get(p.ip) || []), p.acct]);
  for (const accts of byIp.values()) if (accts.length > 1) for (const a of accts) f.set(a, [...(f.get(a) || []), `shared IP with ${accts.length - 1} other wallet(s)`]);
  if (players.length > 1 && secs < 3) for (const p of players) f.set(p.acct, [...(f.get(p.acct) || []), `match only ${secs.toFixed(1)}s`]);
  return f;
}
// Light Cycles settlement. FFA: `ranking` is the final order (best first, ties already broken deterministically) -> solo/2/3+ split.
// Teams: `winners` (members of the winning team, or of all tied teams) split the pot equally.
function settleTron({ id, ranking, team, winners, secs, extraFlags = new Map() }) {
  const dep = ranking.reduce((a, p) => a + (tickets[p.ticket]?.drops || 0), 0), burned = ranking.reduce((a, p) => a + (tickets[p.ticket]?.burn || 0), 0), pot = dep - burned;
  const mf = matchFlags(ranking, secs); for (const [a, f] of extraFlags) mf.set(a, [...(mf.get(a) || []), ...f]);
  let amounts;
  if (team) { const w = winners.length || 1, prize = Math.max(0, pot - R.FEE * w), each = Math.floor(prize / w); amounts = ranking.map(p => winners.includes(p.acct) ? each : 0); }
  else { const sp = split(pot, ranking.length); amounts = ranking.map((p, i) => sp.amounts[i] || 0); }
  const paid = amounts.reduce((a, b) => a + b, 0);
  const rec = { id, game: 'tron', team: !!team, t: Date.now(), dryRun: C.DRY_RUN, depositsDrops: dep, burnDrops: burned, potDrops: pot, prizeDrops: paid, feeReserveDrops: pot - paid,
    standings: ranking.map((p, i) => ({ rank: i + 1, acct: p.acct, team: p.team ?? null, place: p.place, wins: p.wins, flags: mf.get(p.acct) || [], prizeDrops: amounts[i] })) };
  rec.status = rec.standings.some(s => s.flags.length) ? 'held_for_review' : 'auto';
  const all = S.load('ranked_matches.json', {}); all[id] = rec; S.save('ranked_matches.json', all); return autoPay(id);
}
const matches = () => S.load('ranked_matches.json', {});
function publicInfo(live_) {
  const recent = Object.values(matches()).sort((a, b) => b.t - a.t).slice(0, 6).map(m => ({ id: m.id, game: m.game || 'zombie', team: !!m.team, t: m.t, potXrp: m.potDrops / 1e6, status: m.status,
    top: m.standings.filter((s, i) => i < 3 || s.prizeDrops > 0).slice(0, 8).map(s => ({ acct: s.acct, kills: s.kills, place: s.place, team: s.team, prizeXrp: s.prizeDrops / 1e6 })) }));
  const open = openLobbies().map(l => ({ id: l.id, game: l.game || 'zombie', cfg: l.cfg || {}, buyinXrp: l.buyin / 1e6, players: (live_?.[l.id] ?? l.paid.length), paid: l.paid.length, creator: l.creator.slice(0, 6) + '…',
    potXrp: (l.paid.length * (l.buyin - Math.floor(l.buyin * R.BURN))) / 1e6, closesAt: new Date(l.created + R.LOBBY_TTL).toISOString() })).sort((a, b) => b.paid - a.paid);
  return { status: status(), live: live(), dryRun: C.DRY_RUN, minBuyinXrp: R.MINB / 1e6, maxBuyinXrp: R.MAXB / 1e6, burnPct: +(R.BURN * 100).toFixed(4), split: R.SPLIT.map(x => x * 100),
    maxPlayers: R.MAX, lobbyMinutes: R.LOBBY_TTL / 60e3, feeDrops: R.FEE, open, recent };
}
// ---- admin (manual approval only) ----
function adminMatches() { return { dryRun: C.DRY_RUN, status: status(), matches: Object.values(matches()).sort((a, b) => b.t - a.t).slice(0, 100), refundsDue: refunds(), queue: Q.all() }; }
function review(id, acct, accept) {   // accept = flags cleared; reject = that player's prize is withheld and their place goes to the next player
  const all = matches(), m = all[id]; if (!m) return { error: 'not_found' }; const s0 = m.standings.find(x => x.acct === acct); if (!s0) return { error: 'not_in_match' };
  S.append('ranked_reviews.jsonl', { t: Date.now(), id, acct, accept: !!accept, flags: s0.flags });
  if (accept) s0.flags = []; else { s0.disqualified = true; s0.flags = []; }
  if (m.team) { if (!accept) { m.forfeitDrops = (m.forfeitDrops || 0) + s0.prizeDrops; s0.prizeDrops = 0; } if (!m.standings.some(x => x.flags.length)) m.status = 'auto'; all[id] = m; S.save('ranked_matches.json', all); return { ok: true, match: autoPay(id) }; }
  const ok = m.standings.filter(x => !x.disqualified), sp = split(m.potDrops, m.standings.length);
  m.standings.forEach(x => x.prizeDrops = 0); ok.slice(0, 3).forEach((x, i) => x.prizeDrops = sp.amounts[i] || 0);   // places pass down to the next eligible player
  m.forfeitDrops = sp.amounts.slice(ok.length).reduce((a, b) => a + b, 0);   // fewer than 3 eligible left: unclaimed share is burned on approval
  if (!m.standings.some(x => x.flags.length)) m.status = 'auto'; all[id] = m; S.save('ranked_matches.json', all); return { ok: true, match: autoPay(id) };
}
const Q = require('./payq');
// Automatic payout: once a match is settled with no flags, its prize rows go straight into the persistent queue.
// Guard ceilings (match/day/address) or flags => rows are 'held' for admin release. Reserve/pause => stays queued + retried.
function autoPay(id, admin = false) {
  const all = matches(), m = all[id]; if (!m) return null;
  if (m.status === 'held_for_review') return m;
  if (['queued', 'held_guard', 'paid', 'paying'].includes(m.status) && !admin) return m;
  const pays = m.standings.filter(s => s.prizeDrops > 0 && !s.disqualified), total = pays.reduce((a, s) => a + s.prizeDrops, 0);
  if (total + (m.forfeitDrops || 0) > m.potDrops) { m.status = 'held_guard'; m.holdReason = 'exceeds_pot'; all[id] = m; S.save('ranked_matches.json', all); return m; }
  const bad = pays.find(s => !Object.values(tickets).some(t => t.account === s.acct && t.match === id && t.used && !t.refunded && t.hash));
  if (bad) { m.status = 'held_guard'; m.holdReason = 'payee_not_verified_entrant:' + bad.acct; all[id] = m; S.save('ranked_matches.json', all); return m; }
  if (m.forfeitDrops && !m.forfeitBooked) { const o = S.load('burn_owed.json', { drops: 0 }); o.drops += m.forfeitDrops; S.save('burn_owed.json', o); m.forfeitBooked = true; }
  const rows = pays.map(s => ({ id: `${id}:prize:${s.rank}`, kind: 'prize', match: id, dest: s.acct, drops: s.prizeDrops, memo: `${id} rank ${s.rank}` }));
  if (C.DRY_RUN || !live()) { S.append('ranked_payouts.jsonl', { t: Date.now(), id, dryRun: true, rows }); m.status = 'approved_dry_run'; all[id] = m; S.save('ranked_matches.json', all); return m; }
  const r = Q.submitMatch(rows, false); if (admin) Q.release(id);
  m.status = r.status === 'held' && !admin ? 'held_guard' : 'queued'; if (!rows.length) m.status = 'paid'; all[id] = m; S.save('ranked_matches.json', all); return m;
}
async function approve(id) {   // admin: release a match held by a guard ceiling (flags must be reviewed first)
  const m = matches()[id]; if (!m) return { error: 'not_found' }; if (m.status === 'held_for_review') return { error: 'review_flags_first' };
  const x = autoPay(id, true); return { ok: true, status: x.status, released: Q.release(id), payouts: Q.forMatch(id) };
}
Q.hooks.onPaid = r => {
  if (r.kind === 'refund' && tickets[r.ticket]) { tickets[r.ticket].refunded = Date.now(); tickets[r.ticket].refundHash = r.hash; S.save('ranked_tickets.json', tickets); }
  if (r.kind === 'prize') { const all = matches(), m = all[r.match]; if (m && Q.forMatch(r.match).filter(x => x.kind === 'prize').every(x => x.status === 'paid')) { m.status = 'paid'; all[r.match] = m; S.save('ranked_matches.json', all); } }
};
// Cancelled match (never started before its deadline) or a paid entry that never got into a started match:
// refund = verified buy-in minus its 3.22% burn (burn is irreversible and already owed to the BURN job). No admin step.
function sweepRefunds() {
  if (C.DRY_RUN || !live()) return 0; let n = 0;
  for (const r of refunds()) { const t = tickets[r.ticket]; if (t.refundQueued) continue;
    n += Q.enqueue([{ id: 'refund:' + r.ticket, kind: 'refund', match: r.match, dest: r.acct, drops: r.drops, memo: `refund ${r.match}`, ticket: r.ticket }]);
    t.refundQueued = Date.now(); }
  if (n) S.save('ranked_tickets.json', tickets); return n;
}
// Paid in XAMAN but the page was closed / server restarted before verify: finish verifying server-side so the money is never lost.
async function sweepSessions(ledger, sdk) { for (const [sid, s] of sessions) if (s.uuid && !s.done) { try { await verify(sid, ledger, sdk); } catch {} } }
// No fair result (e.g. every rider left before any round finished): refund each verified entry minus its burn.
function refundMatch(id, tks, reason) {
  const all = matches(); all[id] = { id, game: 'tron', t: Date.now(), status: 'cancelled_refunded', reason, potDrops: 0, standings: [] }; S.save('ranked_matches.json', all);
  if (lobbies[id]) { lobbies[id].state = 'cancelled'; saveL(); }
  if (C.DRY_RUN || !live()) return 0; let n = 0;
  for (const k of tks) { const t = tickets[k]; if (!t || t.match !== id || t.refunded || t.refundQueued || !t.hash) continue;
    n += Q.enqueue([{ id: 'refund:' + k, kind: 'refund', match: id, dest: t.account, drops: t.drops - (t.burn || 0), memo: `refund ${id}`, ticket: k }]); t.refundQueued = Date.now(); }
  S.save('ranked_tickets.json', tickets); return n;
}
function payoutStatus(id) { const m = matches()[id]; const L = lobbies[id];
  return { match: id, status: m?.status || (L ? 'lobby_' + L.state : 'unknown'), holdReason: m?.holdReason, payouts: Q.forMatch(id).map(r => ({ kind: r.kind, to: r.dest, xrp: r.drops / 1e6, status: r.status, hash: r.status === 'paid' || r.status === 'submitted' ? r.hash : null })) }; }
// Refund rule: if a match never starts within RANKED_LOBBY_MINUTES (default 30) of being created, every deposit is
// refunded minus its 3.22% burn (already burned) and one network fee, to the paying wallet, after admin approval.
function refunds() { openLobbies(); return Object.entries(tickets).filter(([, t]) => !t.used && !t.refunded && !t.refundQueued && (t.left || t.exp < Date.now() || lobbies[t.match]?.state === 'expired' || lobbies[t.match]?.state === 'started'))
  .map(([k, t]) => ({ ticket: k, match: t.match, acct: t.account, drops: t.drops - (t.burn || 0), entryHash: t.hash, unsignedTx: { TransactionType: 'Payment', Account: C.TREASURY, Destination: t.account, Amount: String(t.drops - (t.burn || 0)), Memos: [{ Memo: { MemoType: hex('burncity/ranked-refund'), MemoData: hex(k) } }] } })); }
// player pressed Leave in a ranked lobby before start: the confirmed entry goes to the normal refund flow and can't be reused
function leaveLobby(ticket) { const t = tickets[ticket]; if (!t || t.used || t.refunded || t.left) return false; t.left = Date.now(); S.save('ranked_tickets.json', tickets); return true; }
function markRefunded(ticket) { const t = tickets[ticket]; if (!t) return { error: 'not_found' }; t.refunded = Date.now(); S.save('ranked_tickets.json', tickets); return { ok: true }; }
function unconsume(ticket) { const t = tickets[ticket]; if (t) { t.used = false; S.save('ranked_tickets.json', tickets); } }   // aborted match
module.exports = { leaveLobby, reconOk, tickets, refunds, lobbyPay, maskA, refundMatch, autoPay, sweepRefunds, sweepSessions, payoutStatus, Q, sessions, settleTron, matchFlags, R, live, status, lobbies, openLobbies, ticketMatch, markStarted, enter, xamanPayload, verify, check, credit, ticketOk, useTicket, unconsume, sanity, rankCmp, split, settle, publicInfo, adminMatches, review, approve, refunds, markRefunded, tickets };
