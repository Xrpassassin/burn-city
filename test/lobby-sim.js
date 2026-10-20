// Lobby leave: ranked entry left before start -> refundable + unusable; started tickets unaffected.
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
Object.assign(process.env, { DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'bclob-')), DRY_RUN: 'true' });
const R = require('../server/ranked'); let n = 0; const ok = (c, m) => { assert(c, m); n++; };
R.lobbies.L1 = { id: 'L1', state: 'open', created: Date.now(), game: 'tron' };
R.tickets.T1 = { account: 'rA', match: 'L1', drops: 5e6, burn: 161000, exp: Date.now() + 9e5, hash: 'H1' };
R.tickets.T2 = { account: 'rB', match: 'L1', drops: 5e6, burn: 161000, exp: Date.now() + 9e5, hash: 'H2', used: true };
ok(R.ticketOk('T1', 'rA', 'L1'), 'ticket valid before leave');
ok(!R.refunds().some(r => r.ticket === 'T1'), 'not refundable while in lobby');
ok(R.leaveLobby('T1') === true, 'leave marks ticket');
ok(!R.ticketOk('T1', 'rA', 'L1'), 'left ticket cannot rejoin');
const rf = R.refunds().find(r => r.ticket === 'T1'); ok(rf && rf.drops === 5e6 - 161000, 'refund due = buy-in minus burn');
ok(R.leaveLobby('T1') === false, 'second leave is a no-op');
ok(R.leaveLobby('T2') === false, 'used (started) ticket cannot leave-refund');
ok(!R.refunds().some(r => r.ticket === 'T2'), 'started entry not refunded');
console.log('lobby-sim: ' + n + ' passed');
