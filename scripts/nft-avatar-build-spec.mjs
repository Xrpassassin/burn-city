#!/usr/bin/env node
// Compile one NFT's preserved metadata + collection recipe into a deterministic authoring handoff.
// This emits a build specification only; it does not fabricate, approve, or load a 3D model.
import fs from 'node:fs';
import path from 'node:path';
import { resolveNftAvatarProfile } from '../client/js/nft-avatar-adapters.js';
import { resolveNftAvatarReconstruction } from '../client/js/nft-avatar-reconstruction.js';
import { getNftAvatarCollectionRecipe } from '../client/js/nft-avatar-collection-recipes.js';

const KNOWN_SLOTS = new Set(['background','eye color','eye appearance','nose','body effect','accessory','outfit','headwear','weapon','fur color','hair style','hair color','skin color','armor','mask','expression','facial hair','markings','body pattern','horns','wing','flame','eye wear','tail','identity']);
const shaSafe = value => String(value ?? '').trim();
export function compileNftAvatarBuildSpec(nft = {}) {
  if (!nft || typeof nft !== 'object' || Array.isArray(nft)) throw new TypeError('NFT input must be an object');
  const rawKey = String(nft.key || nft.collectionKey || '').trim().toLowerCase();
  if (!rawKey) throw new Error('NFT input requires collection key "key"');
  const tokenId = shaSafe(nft.id ?? nft.nftId ?? nft.tokenId);
  if (!tokenId) throw new Error('NFT input requires token id "id", "nftId", or "tokenId"');
  const rawTraits = Array.isArray(nft.traits) ? nft.traits : [];
  if (rawTraits.some(t => !Array.isArray(t) || t.length < 2)) throw new Error('traits must contain [type, value] pairs');
  const profile = resolveNftAvatarProfile({ ...nft, key: rawKey, id: tokenId, traits: rawTraits });
  const recipe = getNftAvatarCollectionRecipe(profile.collectionKey);
  const reconstruction = resolveNftAvatarReconstruction(profile);
  const normalizedTraits = profile.rawTraits.map((pair, index) => {
    const [type, value] = pair;
    const slot = profile.renderTraits[index]?.[0] || 'unknown';
    return { sourceType: type, sourceValue: value, renderSlot: slot, mapped: KNOWN_SLOTS.has(slot), recipeHint: recipe.traitSlots[type] || null };
  });
  const artworkReference = shaSafe(nft.artworkReference || nft.img || nft.image || nft.imageUrl) || null;
  return {
    specVersion: 1,
    pipeline: 'burn-city-nft-avatar',
    pipelineVersion: '0.2.0',
    identity: {
      collectionKey: recipe.key,
      requestedCollectionKey: rawKey,
      collectionName: recipe.displayName,
      tokenId,
      displayName: shaSafe(nft.name) || tokenId,
      artworkReference,
      artworkSha256: null,
      rawTraits: profile.rawTraits
    },
    reconstruction: {
      archetype: reconstruction.archetype,
      rigProfile: reconstruction.rigProfile,
      proportions: {
        torsoWidth: reconstruction.torsoWidth,
        torsoHeight: reconstruction.torsoHeight,
        headScale: reconstruction.headScale,
        shoulderSpan: reconstruction.shoulderSpan,
        hipSpan: reconstruction.hipSpan,
        headY: reconstruction.headY,
        legScale: reconstruction.legScale,
        armScale: reconstruction.armScale
      },
      silhouetteTags: reconstruction.silhouetteTags,
      signature: reconstruction.signature,
      materialHints: reconstruction.materialHints,
      traitOverrides: reconstruction.traitOverrides,
      exactReconstruction: false
    },
    traits: { normalized: normalizedTraits, unmapped: normalizedTraits.filter(t => !t.mapped) },
    production: {
      targetBudgets: recipe.budgets,
      visualAcceptanceCriteria: recipe.visualRequirements,
      originalArtworkRequired: recipe.originalArtworkRequired,
      tasks: [
        'verify collection issuer/taxon and token identity outside rendering',
        'inspect original artwork and confirm all signature features',
        'author or generate collection-specific geometry and token-specific components',
        'rig and validate collection rig profile',
        'export a normalized-unit GLB build candidate',
        'optimize textures, triangle count, materials and draw calls to target budgets',
        'compare front, three-quarter, side and rear views against original artwork',
        'profile on representative mobile hardware',
        'record source rights, output SHA-256 and review evidence in model manifest'
      ],
      rightsReviewRequired: true,
      visualQaRequired: true,
      mobilePerfReviewRequired: true,
      runtimeApproved: false
    }
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input) {
    console.error('Usage: node scripts/nft-avatar-build-spec.mjs token.json [build-spec.json]');
    process.exitCode = 2;
  } else {
    try {
      const nft = JSON.parse(fs.readFileSync(input, 'utf8'));
      const spec = compileNftAvatarBuildSpec(nft);
      const serialized = JSON.stringify(spec, null, 2) + '\\n';
      if (output) fs.writeFileSync(output, serialized, { flag: 'wx' });
      else process.stdout.write(serialized);
    } catch (error) {
      console.error('Build spec rejected:', error.message);
      process.exitCode = 1;
    }
  }
}
