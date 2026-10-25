#!/usr/bin/env node
// Offline bridge: server-verified token-only intake + cached NFT metadata -> model queue.
// Run on an authorized copy of the server volume; never expose this as a public endpoint.
import fs from 'node:fs';
import path from 'node:path';
import { compileHolderAvatarQueue } from './nft-holder-avatar-queue.mjs';

export function buildQueueFromIntake(intake, metadataLookup) {
  if (!intake || !intake.tokens || typeof intake.tokens !== 'object' || Array.isArray(intake.tokens)) throw new TypeError('Invalid token intake');
  const nfts = [], missingMetadata = [];
  for (const [id, entry] of Object.entries(intake.tokens)) {
    if (!/^[0-9A-F]{64}$/.test(id) || !['racc', 'fk', '589'].includes(entry?.key) || entry.id !== id) continue;
    const metadata = metadataLookup(id);
    if (!metadata || metadata.id !== id || metadata.key !== entry.key || !Array.isArray(metadata.traits)) {
      missingMetadata.push({ id, key: entry.key });
      continue;
    }
    nfts.push({ ...metadata, id, key: entry.key });
  }
  const result = compileHolderAvatarQueue([{ nfts }]);
  return { ...result, missingMetadata, verifiedTokenCount: nfts.length + missingMetadata.length };
}
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const [intakeFile, metadataDir] = process.argv.slice(2);
  if (!intakeFile || !metadataDir) {
    console.error('Usage: node scripts/nft-holder-avatar-export.mjs /volume/nft_holder_avatar_intake.json /volume/nft > queue.json');
    process.exitCode = 2;
  } else {
    try {
      const intake = JSON.parse(fs.readFileSync(intakeFile, 'utf8'));
      const queue = buildQueueFromIntake(intake, id => {
        try { return JSON.parse(fs.readFileSync(path.join(metadataDir, id + '.json'), 'utf8')); } catch { return null; }
      });
      process.stdout.write(JSON.stringify(queue, null, 2) + '\n');
    } catch (e) {
      console.error('NFT holder export failed:', e.message);
      process.exitCode = 1;
    }
  }
}
