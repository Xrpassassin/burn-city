#!/usr/bin/env node
// Batch generation for verified-holder avatar candidates. Never marks models approved.
// Usage: node scripts/nft-holder-avatar-build.mjs queue.json output-directory [--dry-run]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBlockout, validateBuildInputs } from './nft-avatar-build-pipeline.mjs';

const allowed = new Set(['racc', 'fk', '589']);
const idPattern = /^[0-9A-F]{64}$/;
export function planHolderBuilds(queue, outputDirectory) {
  if (!queue || !Array.isArray(queue.queue)) throw new TypeError('Invalid holder queue');
  const seen = new Set();
  return queue.queue.map(entry => {
    if (!entry || !allowed.has(entry.collection) || !idPattern.test(entry.tokenId) ||
        entry.status !== 'needs_art_review' || entry.spec?.identity?.tokenId !== entry.tokenId ||
        entry.spec?.identity?.collectionKey !== entry.collection)
      throw new Error('Invalid or unsupported holder build entry');
    const key = entry.collection + ':' + entry.tokenId;
    if (seen.has(key)) throw new Error('Duplicate NFT token in queue: ' + key);
    seen.add(key);
    const folder = path.resolve(outputDirectory, entry.collection);
    const outputPath = path.join(folder, entry.tokenId + '.glb');
    const errors = validateBuildInputs(entry.spec, outputPath);
    if (errors.length) throw new Error(errors.join('; '));
    return { entry, folder, outputPath, specPath: path.join(folder, entry.tokenId + '.spec.json'),
      recordPath: path.join(folder, entry.tokenId + '.candidate.json') };
  });
}
export async function runHolderBuilds(queue, outputDirectory, { dryRun = false, blender } = {}) {
  const jobs = planHolderBuilds(queue, outputDirectory);
  const results = [];
  for (const job of jobs) {
    if (dryRun) { results.push({ tokenId: job.entry.tokenId, collection: job.entry.collection, status: 'planned' }); continue; }
    await fs.mkdir(job.folder, { recursive: true });
    // Do not overwrite specs or models: each job is reviewable and reproducible.
    try {
      await fs.writeFile(job.specPath, JSON.stringify(job.entry.spec, null, 2) + '\n', { flag: 'wx' });
      const { record } = await buildBlockout({ specPath: job.specPath, outputPath: job.outputPath, manifestPath: job.recordPath, blender });
      results.push({ tokenId: job.entry.tokenId, collection: job.entry.collection, status: 'blockout-created', record });
    } catch (error) {
      results.push({ tokenId: job.entry.tokenId, collection: job.entry.collection, status: 'failed', error: error.message });
    }
  }
  return { total: jobs.length, built: results.filter(r => r.status === 'blockout-created').length, results };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output, flag] = process.argv.slice(2);
  if (!input || !output || (flag && flag !== '--dry-run')) {
    console.error('Usage: node scripts/nft-holder-avatar-build.mjs queue.json output-directory [--dry-run]');
    process.exitCode = 2;
  } else {
    try {
      const queue = JSON.parse(await fs.readFile(input, 'utf8'));
      const result = await runHolderBuilds(queue, output, { dryRun: flag === '--dry-run' });
      console.log(JSON.stringify(result, null, 2));
      if (result.results.some(r => r.status === 'failed')) process.exitCode = 1;
    } catch (error) { console.error('Holder build failed:', error.message); process.exitCode = 1; }
  }
}
