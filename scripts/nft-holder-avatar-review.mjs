#!/usr/bin/env node
// Offline triage: identify NFTs requiring manual visual reconstruction first.
// Never publishes wallet data or approves candidate models.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function compileHolderVisualReview(queue) {
  if (!queue || !Array.isArray(queue.queue)) throw new TypeError('Expected holder avatar queue');
  const rows = queue.queue.map(item => {
    const spec = item.spec || {};
    const traits = Array.isArray(spec.traits?.normalized) ? spec.traits.normalized : [];
    const unmapped = traits.filter(t => !t.mapped).map(t => ({ type: t.sourceType, value: t.sourceValue }));
    const artwork = spec.identity?.artworkReference || null;
    const reasons = [];
    if (!artwork) reasons.push('missing_original_artwork');
    if (unmapped.length) reasons.push('unmapped_traits');
    if (!traits.length) reasons.push('no_trait_metadata');
    reasons.push('requires_visual_likeness_review');
    return {
      collection: item.collection, tokenId: item.tokenId, name: item.displayName,
      artwork, totalTraits: traits.length, unmapped, reasons,
      priorityScore: (artwork ? 0 : 100) + unmapped.length * 10 + (traits.length ? 0 : 30),
      runtimeApproved: false
    };
  });
  rows.sort((a,b) => b.priorityScore-a.priorityScore || a.collection.localeCompare(b.collection) || a.tokenId.localeCompare(b.tokenId));
  return { version: 1, stage: 'visual-review-triage', total: rows.length, needsArtwork: rows.filter(r=>!r.artwork).length,
    withUnmappedTraits: rows.filter(r=>r.unmapped.length).length, rows };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) { console.error('Usage: node scripts/nft-holder-avatar-review.mjs queue.json review.json'); process.exitCode=2; }
  else {
    try {
      const result = compileHolderVisualReview(JSON.parse(fs.readFileSync(input,'utf8')));
      fs.writeFileSync(output, JSON.stringify(result,null,2)+'\n', { flag:'wx' });
      console.log('Wrote '+result.total+' NFT review entries to '+output);
    } catch(e) { console.error(e.message); process.exitCode=1; }
  }
}
