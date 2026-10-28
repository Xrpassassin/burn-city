# NFT Artwork Presentation and 3D Fidelity Production Spec

Scope: BURN City NFT presentation and source-faithful 3D reconstruction for RACC, 589 Protocol, and Firekeepers.

This spec is an acceptance contract, not a claim that models have already passed review. The original token artwork is the visual authority. A procedural recipe, trait label, or generic model is never sufficient evidence of fidelity.

## 1. Artwork-first character record

For every token, retain:
- exact NFTokenID, verified collection identity, issuer/taxon, source listing URL, metadata URI, and original metadata payload;
- original artwork URL and resolved display URL, source attribution, image dimensions, and retrieval/error status;
- original trait names and values exactly as supplied, plus separate normalized values;
- a token-specific reference sheet or QA record showing the original art alongside front, side, rear, and three-quarter 3D views;
- explicit unresolved-trait and mismatch lists.

Do not silently replace broken/missing artwork with a generated placeholder. Show a clear unavailable state and preserve the source link. Keep the artwork panel visually distinct from the 3D viewport so a 2D image cannot be mistaken for a reconstructed model.

## 2. Original artwork presentation

- Use the source artwork as the default thumbnail/hero image where the source permits display; preserve its original aspect ratio and avoid cropping defining traits.
- Provide a high-resolution view/lightbox and a direct source-marketplace link. Include visible source attribution as required by the data provider.
- Keep artwork on a neutral, consistent canvas; do not bake new backgrounds, logos, props, or effects into the source image.
- Preserve alpha transparency when available. Otherwise contain the complete image within a neutral background rather than cutting off hats, weapons, tails, flames, or other silhouettes.
- Use a stable loading state, explicit broken-image/error state, and accessible alt text derived from verified token/trait metadata.
- Sanitize all remote labels and URLs; only permit HTTP(S) and approved IPFS gateway resolution. Never execute remote metadata or treat its text as trusted HTML.
- Avoid downloading/rehosting artwork by default. Cache only under the project's approved policy and after rights/licensing review.

## 3. Reconstruction pipeline

### A. Extract and classify
1. Load the token by exact NFTokenID, not a name or search result.
2. Verify issuer/taxon and collection identity before accepting metadata.
3. Preserve raw metadata and record all trait types/values, artwork references, and missing/unknown fields.
4. Build a per-token trait manifest. Never infer an absent trait from another token in the collection.
5. Flag traits that cannot be confidently interpreted; do not substitute a generic lookalike.

### B. Model the character
- Start from the correct collection-specific rig and silhouette, then apply token-specific geometry, materials, textures, and accessories.
- Use real geometry for silhouette-defining traits and prominent accessories. Flat image cards/billboards do not count as 3D reconstruction.
- Match distinctive proportions, facial structure, markings, clothing cut, colors, pattern placement, accessory size, and attachment position.
- Give materials physically plausible roughness/metalness and appropriate detail at the intended camera distance. Fur, woven straw, fabric, metal, leather, flames/emissives, and skin should not all share one generic shader.
- Keep lighting flattering but neutral enough that colors and markings remain comparable to the source. Do not use bloom, shadows, or post-processing to conceal missing geometry.
- Ensure accessories remain attached and correctly oriented during animation; test clipping, collision, hand grips, tail movement, and occlusion.

### C. Trait asset reuse
- Canonical key: collection + exact normalized trait type + value + explicit variant.
- Similar labels are candidates for comparison, not proof that two assets are visually interchangeable.
- Reuse an asset only after comparing its source artwork and confirming geometry, materials, proportions, and placement are equivalent.
- Store slot/anchor, transform, rig families, compatible collections, source token IDs, source art URLs, version, provenance, rights state, and visual approval.
- Rights and visual approval must both be explicitly approved before a trait is equipable. Unknown status fails closed.
- A game loadout change is not an on-ledger NFT transfer and must never be represented as one.

## 4. Visual QA and measurable acceptance gates

Every token selected for 3D release must pass all gates below; collection coverage is reported separately.

1. **Source identity:** exact NFTokenID and issuer/taxon validated; source listing and artwork reference recorded.
2. **Trait coverage:** every source trait is either represented or listed as an explicit unresolved mismatch. No silent omissions.
3. **Silhouette:** head/body proportions and all defining accessories are recognizable from front, side, rear, and three-quarter views.
4. **Color/pattern:** dominant colors, markings, clothing patterns, and placement match the source at a fixed neutral lighting setup.
5. **Geometry:** important traits are actual 3D geometry; no flat artwork masquerading as a model.
6. **Attachment:** equipment fits the rig, stays attached during animation, and has no major clipping or floating.
7. **Presentation:** source artwork and 3D preview are shown side-by-side at comparable scale; camera and lighting presets are repeatable.
8. **Performance:** model meets the collection recipe's triangle, texture-memory, and draw-call budgets, or records an approved exception.
9. **Rights/provenance:** source and asset provenance are recorded; distribution/use rights are reviewed before shipping.
10. **Approval:** reviewer, date, build/version, evidence images, and mismatch notes are stored. Until approved, the asset remains preview-only and cannot be equipped in production.

A pass for one token does not certify every token sharing a trait label. Report results per token and per unique trait asset.

## 5. RACC GUY1979 reference acceptance example

Use exact token ID 000A271005C6E016B0AB93B24A603594F2A3989BD7503434C700A18905BF49E4 as an initial visual QA case. The source-reference checklist should specifically check:
- broad gray raccoon head, dark eye mask, bright blue eyes, white muzzle pads, and distinct black nose;
- oversized pale-tan woven conical straw hat, including its crown, brim, and visible weave/hatching;
- gray fur and dark sweater with thin yellow horizontal stripes and yellow collar;
- raised dark-gloved hand holding a red TNT stick with a lit fuse;
- ringed tail, with visibility and silhouette checked from side and rear angles;
- exact artwork traits and source art displayed beside the reconstructed model.

Treat this as a checklist of observed reference features, not permission to invent absent geometry or to mark the model approved without a visual comparison.

## 6. Required reports

Produce a report for each collection with:
- expected versus observed token count and inventory completeness;
- metadata and artwork availability/error counts;
- source traits observed, canonical traits proposed, and unresolved/ambiguous traits;
- unique 3D assets built, pending, approved, rejected, and rights-pending;
- per-token fidelity status and evidence links;
- known technical/performance issues and the next concrete blocker.

Do not describe the collection as fully reconstructed until inventory reconciliation is complete and every included token/trait has a documented fidelity status.