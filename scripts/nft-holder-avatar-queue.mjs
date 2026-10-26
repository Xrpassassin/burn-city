#!/usr/bin/env node
// Offline, opt-in production queue for verified /api/nft/mine responses.
// No credentials, wallet addresses, or private account records are written.
import fs from 'node:fs';
import { compileNftAvatarBuildSpec } from './nft-avatar-build-spec.mjs';

const SUPPORTED = new Set(['racc', 'fk', '589']);
export function compileHolderAvatarQueue(snapshots) {
  if (!Array.isArray(snapshots)) throw new TypeError('Expected an array of verified NFT inventory snapshots');
  const tokens = new Map();
  let skipped = 0;
  for (const snapshot of snapshots) {
    if (!snapshot || !Array.isArray(snapshot.nfts)) throw new TypeError('Each snapshot needs an nfts array');
    for (const nft of snapshot.nfts) {
      if (!nft || !SUPPORTED.has(nft.key) || nft.pending || !nft.id) { skipped++; continue; }
      const id = String(nft.id).trim();
      if (!/^[0-9A-F]{64}$/i.test(id)) { skipped++; continue; }
      const key = nft.key + ':' + id.toUpperCase();
      if (!tokens.has(key)) tokens.set(key, { ...nft, id: id.toUpperCase() });
    }
  }
  const queue = [];
  for (const nft of tokens.values()) {
    try {
      const spec = compileNftAvatarBuildSpec(nft);
      queue.push({ collection: nft.key, tokenId: nft.id, displayName: spec.identity.displayName,
        spec, status: 'needs_art_review' });
    } catch {
      skipped++;
    }
  }
  queue.sort((a, b) => a.collection.localeCompare(b.collection) || a.tokenId.localeCompare(b.tokenId));
  return { version: 1, source: 'verified-nft-inventory-snapshots', supportedCollections: [...SUPPORTED],
    count: queue.length, skipped, queue };
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/nft-holder-avatar-queue.mjs verified-inventories.json > avatar-queue.json');
    process.exitCode = 2;
  } else {
    try {
      const input = JSON.parse(fs.readFileSync(file, 'utf8'));
      const queue = compileHolderAvatarQueue(input);
      process.stdout.write(JSON.stringify(queue, null, 2) + '\n');
    } catch (e) {
      console.error('Avatar queue error:', e.message);
      process.exitCode = 1;
    }
  }
}
