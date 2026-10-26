# RACC: first real Blender validation (Hark handoff)

**Priority:** RACC base only. Do not start 589 Protocol or Firekeepers until RACC base passes visual and rig gates. Do not merge or deploy from this run.

## Prerequisites
- Checkout `feat/homefront-direct-exploration` from `Xrpassassin/burn-city`.
- Install Blender with Python glTF import/export enabled; ensure `blender --version` succeeds.
- Use an **existing RACC build-spec JSON** with `specVersion: 1`, `identity.collectionKey: "racc"` and a valid `reconstruction` section. The generator expects the project's compiled build-spec format, not an arbitrary JSON or a live wallet.
- Confirm input NFT reference art and authorization separately; the procedural model is only a blockout.

## Commands
From the repository root:

```bash
mkdir -p build/racc-review
blender -b --python tools/blender/nft_avatar_generator.py -- path/to/racc-build-spec.json build/racc-review/racc-blockout.glb
python3 tools/blender/run_racc_review.py --input build/racc-review/racc-blockout.glb --out build/racc-review
```

If Blender is not on PATH, supply `--blender /absolute/path/to/blender` to the second command and use that executable for the first.

## Expected outputs
- `build/racc-review/racc-blockout.glb` — original procedural blockout
- `build/racc-review/racc-fused.blend` — editable scene with preserved original anatomy
- `build/racc-review/racc-fused-review.glb` — isolated fused-body review export
- `build/racc-review/racc-fused-fusion-qa.json` — connected-component and topology heuristics
- `build/racc-review/racc-preview-front.png`
- `build/racc-review/racc-preview-three-quarter.png`
- `build/racc-review/racc-preview-side.png`
- `build/racc-review/racc-preview-rear.png`
- `build/racc-review/racc-preview-qa.json`
- `build/racc-review/racc-review-summary.json`

## Hark's acceptance/rejection checklist
1. Record Blender version and exact commands used.
2. If a command fails, capture stderr and the exact failure; **do not report a render as completed**.
3. Compare all four images against RACC reference art. Check muzzle, mask, ear proportions, shoulders, hands, legs, tail silhouette, and seams.
4. Review `continuousBodyPass`, `nonManifoldEdges`, `degenerateFaces`, and `fusedTriangles`; passing these checks does not imply animation readiness.
5. Check that body fusion did not destroy the original materials or erase distinguishing features. Voxel fusion may flatten materials: flag for manual material restoration.
6. Confirm the editable scene retains source anatomy; keep the fused body marked as **blockout requiring retopology**.
7. Do not claim rigging, skin weights, animations, mobile performance, or NFT likeness are complete until each is separately tested.

## Deliverable
Attach the four PNGs, review GLB, two QA manifests, and a concise issue list. Report **actual results**, not anticipated results. Do not modify the live deployment.
