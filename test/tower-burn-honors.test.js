'use strict';
const assert = require('node:assert/strict');
const { selectTowerHonorees } = require('../server/tower-burn-honors');
const nftId = 'A'.repeat(64);
const leaderboard = { status: 'complete', ranked: [
 { rank: 1, wallet: 'rWinner', returned: '700', transactions: 4 },
 { rank: 2, wallet: 'rOther', returned: '300', transactions: 2 }
]};
const registeredWallets = new Set(['rWinner', 'rOther']);
const verifiedAvatars = new Map([
 ['rWinner', {wallet:'rWinner', verified:true, ownershipCurrent:true, displayOutsideTower:true, nftId, collectionKey:'racc'}],
 ['rOther', {wallet:'rOther', verified:true, ownershipCurrent:false, displayOutsideTower:true, nftId, collectionKey:'589'}]
]);
let r = selectTowerHonorees({ leaderboard, registeredWallets, verifiedAvatars });
assert.equal(r.length, 1);
assert.equal(r[0].wallet, 'rWinner');
assert.equal(r[0].avatarSource, 'verified-shared-nft');
assert.deepEqual(selectTowerHonorees({ leaderboard: { ...leaderboard, status: 'partial' }, registeredWallets, verifiedAvatars }), []);
assert.deepEqual(selectTowerHonorees({ leaderboard, registeredWallets: new Set(), verifiedAvatars }), []);
verifiedAvatars.get('rOther').ownershipCurrent = true;
verifiedAvatars.get('rOther').displayOutsideTower = false;
assert.equal(selectTowerHonorees({ leaderboard, registeredWallets, verifiedAvatars }).length, 1);
verifiedAvatars.get('rOther').displayOutsideTower = true;
assert.equal(selectTowerHonorees({ leaderboard, registeredWallets, verifiedAvatars, maxDisplays: 1 }).length, 1);
assert.equal(selectTowerHonorees({ leaderboard, registeredWallets, verifiedAvatars }).length, 2);
verifiedAvatars.get('rWinner').nftId = '../../external.glb';
assert.equal(selectTowerHonorees({ leaderboard, registeredWallets, verifiedAvatars }).length, 1);
console.log('tower-burn-honors: all tests passed');
