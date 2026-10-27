'use strict';
// Tower honors selection policy. Server supplies authenticated wallet, freshly verified
// NFT ownership and explicit display preference; never trusts client-submitted wallet/NFT.
// Scene renderer should consume only entries approved by this function, using the existing
// shared NFT avatar runtime rather than loading untrusted 3D assets.
function selectTowerHonorees({ leaderboard, registeredWallets, verifiedAvatars, maxDisplays = 10 }) {
  if (!leaderboard || !Array.isArray(leaderboard.ranked) ||
      leaderboard.status !== 'complete') return [];
  if (!(registeredWallets instanceof Set) || !(verifiedAvatars instanceof Map))
    throw Error('trusted wallet registration and NFT verification required');
  if (!Number.isSafeInteger(maxDisplays) || maxDisplays < 0 || maxDisplays > 30)
    throw Error('invalid display limit');
  const results = [];
  for (const row of leaderboard.ranked) {
    if (results.length >= maxDisplays) break;
    if (!row || typeof row.wallet !== 'string' ||
        !Number.isSafeInteger(row.rank) || row.rank < 1 || !registeredWallets.has(row.wallet)) continue;
    const avatar = verifiedAvatars.get(row.wallet);
    if (!avatar || avatar.wallet !== row.wallet || avatar.verified !== true ||
        avatar.displayOutsideTower !== true || avatar.ownershipCurrent !== true ||
        !['racc', 'fk', '589'].includes(avatar.collectionKey) ||
        typeof avatar.nftId !== 'string' || !/^[0-9A-F]{64}$/i.test(avatar.nftId)) continue;
    // A binding to the existing approved collection-specific renderer, not executable asset URLs.
    results.push({
      rank: row.rank, wallet: row.wallet, returned: row.returned,
      transactions: row.transactions, nftId: avatar.nftId.toUpperCase(),
      collectionKey: avatar.collectionKey, display: 'tower-forecourt',
      avatarSource: 'verified-shared-nft'
    });
  }
  return results;
}
module.exports = { selectTowerHonorees };
