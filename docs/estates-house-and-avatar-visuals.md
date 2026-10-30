# Estates house visuals and temporary NFT walkers

The playable Estates island now uses five distinct procedural building designs: sided trailers, pitched-roof starter and family homes, apartments with Juliet balconies, and flat-roof mansions with an upper pavilion. Doors, glazing, frames, rooflines and planting are static instanced boxes, grouped into ten material batches for the whole neighbourhood. Solid details remain inside the existing building footprints; lot positions, navigation, property rights and financial settings are unchanged.

NFT characters default to the existing shared walker with a fixed collection palette:

| Collection | Suit | Accent |
| --- | --- | --- |
| RACC | Silver-blue `#647383` | Silver `#d9e2e9` |
| Firekeepers | Ember brown `#71361f` | Orange `#ff9c38` |
| 589 Protocol | Burgundy `#713746` | Gold `#ffd477` |

These are temporary collection markers, not individual NFT reconstructions. Token traits and sampled artwork palettes do not change their geometry or colours. Existing server ownership verification still determines who may wear an NFT avatar. Walking, arms-up poses and heading conventions remain compatible. Shared geometry/materials survive avatar removal. Portraits and artwork panels are not downloaded by this placeholder path.

The existing detailed reconstruction remains available only with `buildNftChar(nft, {detailed:true})`, including the developer NFT visual QA page. PR #339 is not part of this change; collection-specific models require later visual review.

`client/estates-visual-review.html` provides home, collection and island views. Tests exercise the actual vendored Three.js geometry, footprint bounds, instancing, rig animation, heading and shared-resource cleanup. The full existing npm suite passed locally. Browser visual inspection was attempted but the provided cloud browser cannot create a WebGL context. Real desktop/iPhone appearance and frame rate therefore remain unverified.
