# Holder-first NFT avatar production runbook

Scope: RACC (`racc`), Firekeepers (`fk`), 589 Protocol (`589`). This pipeline processes verified tokens, not a public wallet list.

1. Deploy reviewed server changes. When an authenticated player requests NFT holdings, the existing XRPL `account_nfts` scan records **token IDs only** in the server store's `nft_holder_avatar_intake.json`. No wallet identifiers or credentials are exported. This is a cumulative *seen-held* intake, not a claim that every NFT remains held at export time.
2. On an authorized copy of the server volume, use the intake file and cached NFT metadata directory:
   ```sh
   node scripts/nft-holder-avatar-export.mjs /volume/nft_holder_avatar_intake.json /volume/nft > holder-avatar-queue.json
   ```
3. Inspect `missingMetadata` and review the queue. Never use unverified marketplace ownership claims to fill gaps.
4. Dry run before building:
   ```sh
   node scripts/nft-holder-avatar-build.mjs holder-avatar-queue.json ./candidate-avatars --dry-run
   ```
5. On a machine with Blender installed, create **unapproved** candidates:
   ```sh
   node scripts/nft-holder-avatar-build.mjs holder-avatar-queue.json ./candidate-avatars
   ```
6. Review the original artwork against each candidate in the existing visual QA workflow, refine geometry and rigging, verify rights and mobile performance, and only then pass the existing runtime approval gate.

The output is deliberately not automatically installed into the game. Build records carry `runtimeApproved: false`; missing artwork or failed Blender jobs remain pending. Re-running against an existing output directory refuses to overwrite previous work.

Tests: `npm run test:nft-holder-queue`.

**Operational limitations:** No access to the live player database is provided by the repository connector. Token intake begins only after the server change is deployed and players trigger verified scans. The existing procedural generator creates collection-aware blockouts, not guaranteed token-faithful, rigged character models. A current ownership recheck is required before using any NFT for wallet-gated gameplay rights.
