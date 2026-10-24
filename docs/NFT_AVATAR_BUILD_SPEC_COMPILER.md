# NFT avatar token build-spec compiler

The compiler turns one NFT metadata snapshot into a deterministic, machine-readable handoff for 3D authoring. It combines the existing trait normalizer and collection recipe resolver, preserves original traits, lists unknown render slots, attaches visual acceptance criteria and target budgets, and emits a per-token production checklist.

## Usage

```sh
node scripts/nft-avatar-build-spec.mjs path/to/token.json build-spec.json
```

Input example:

```json
{
  "key": "racc",
  "id": "RACC-42",
  "name": "Raccoon sample",
  "img": "https://example.invalid/art.png",
  "traits": [["Bandit Mask", "Crimson"], ["Ring Tail", "Black and White"]]
}
```

Omit the output path to print the specification to stdout. Output files are created exclusively; an existing path is never overwritten. The compiler does not fetch arbitrary artwork URLs.

## Guarantees and limitations

- Raw collection key, token ID, artwork reference, and original trait pairs are preserved.
- The resolved recipe supplies archetype, rig intent, proportions, silhouette, material hints, acceptance criteria and mobile target budgets.
- Unknown traits remain visible in `traits.unmapped`; they are not silently discarded.
- Every generated spec sets `runtimeApproved: false`.
- This is an authoring/build handoff, not a mesh generator. A model still needs rights review, authored/generated geometry, rig validation, GLB export, optimization, visual QA, mobile profiling, and a manifest with output digest before runtime approval.
- An artwork URL is recorded as a reference only. It is not fetched or treated as proof of ownership.
