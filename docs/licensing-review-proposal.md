# BURN City licensing review — proposal only

**Status:** DRAFT / NO LICENSE CHANGE AUTHORIZED. This document is not a license, permission grant, or replacement for the repository's existing MIT license.

## User's stated policy
Allow derivatives and commercial reuse, provided applicable copyright, license and attribution notices are preserved. Visible in-game promotion is not required.

## Confirmed from development branch
- Root `LICENSE`: MIT, copyright (c) 2026 Derrik Hicks (Xrpassassin).
- Root `package.json`: `license: "MIT"`; runtime dependencies include `sharp`, `ws`, `xrpl`, and `xumm-sdk`.
- `package-lock.json`: root package declares `ISC`, inconsistent with `package.json` and `LICENSE`; regenerate only after a licensing decision.
- `client/vendor/three/LICENSE`: MIT, Three.js authors.
- `client/vendor/yuka/LICENSE`: MIT, Yuka authors.
- `client/arena/sfx/LICENSES.md`: CC0 source credits for Freesound recordings; validate each source before final signoff.
- `client/arena/assets/homefront/README.md`: CC0 provenance recorded for Quaternius and Kenney GLBs; validate each asset's origin and rights.
- `client/blacktide/THIRD_PARTY_LICENSES.md`: existing licensing notes; some referenced projects are design references, not necessarily incorporated source.
- `docs/estates-island-model-pilot.md`: model intake process; no approved pilot GLB confirmed by this review.
- `OPEN_SOURCE_AUDIT.md`: explicitly distinguishes candidate libraries from incorporated code.

## Recommendation (subject to review)
Apache-2.0 for **owned original code in future releases**, with a carefully prepared NOTICE and retained third-party license files. Apache-2.0 requires preservation of relevant source notices, documentation of changed files, and distribution of NOTICE attribution where applicable. It does **not** require a visible in-game shout-out or automatically grant trademark rights.

**Existing MIT releases remain MIT**; a later relicensing cannot revoke permissions already granted. Only authorized copyright owners can relicense their respective contributions. Do not assume all contributors assigned rights.

## Boundaries
1. **Original code**: eligible for Apache-2.0 only after ownership/contributor clearance.
2. **Vendored libraries / npm dependencies**: keep upstream licenses and applicable notices; do not claim they are authored by BURN City. Build complete SBOM from lockfile and vendored directories.
3. **Models, textures, sounds, music, promotional art**: independent asset-rights inventory with author, URL, version, license, modifications, and proof. Do not blanket-license under a code license.
4. **NFT artwork and traits**: require collection-specific authorization covering rendering, adaptation, redistribution, commercial use and sublicense, even when tokens are held by the team.
5. **Brand**: reserve official BURN City logos/branding subject to trademark clearance; permit factual attribution.
6. **Secrets and infrastructure**: never distribute wallet secrets, credentials, private configuration, or live operational data as part of open-source releases.

## Pre-change checklist
- [ ] Identify all contributors and obtain authorization for any relicensing.
- [ ] Inventory all tracked source/assets and vendored dependencies, including binary and generated files.
- [ ] Reconcile `package-lock.json` ISC metadata with root MIT declarations.
- [ ] Verify license texts and attribution for each dependency and asset.
- [ ] Flag GPL/AGPL, noncommercial, no-derivatives, proprietary or unknown-rights material for individual review.
- [ ] Confirm NFT collection rights in writing and separate excluded artwork.
- [ ] Define which code/assets are included in the new grant and what remains separately licensed.
- [ ] Prepare `LICENSE`, `NOTICE`, `THIRD_PARTY_LICENSES`, `ASSET_RIGHTS`, `TRADEMARKS.md`, and `CONTRIBUTING.md` for owner approval.
- [ ] Review commercial/hosted use, attribution obligations, and existing MIT downstream rights with qualified IP counsel.
- [ ] Only after approval: update license files, package metadata and release notes together.

## Audit limitations
This is a **targeted first-pass repository audit**, not a full tree/SBOM scan, third-party provenance verification, copyright ownership opinion, or legal advice. No existing license or source permissions have been modified.

References:
- https://www.apache.org/licenses/LICENSE-2.0
- https://www.apache.org/legal/apply-license
- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository
