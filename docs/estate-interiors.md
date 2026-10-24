# Estates interior prototype

This branch adds a first enter/exit loop for the nine procedural Estates properties.

## Player flow
- Select a residence in Orbit mode and use **Enter this residence**, or approach the front threshold in Explore mode and press **E** (mobile: **USE**).
- The client switches to third-person Explore mode if needed, hides the exterior property card, and stages the player inside that residence's furnished interior.
- Walk around the room; the lightweight movement guard keeps the player within the interior bounds.
- Approach the interior threshold and press **E** / **USE** to return to the exterior entrance.

## Tier-specific furnishing
- **Trailer:** compact sleeping area, storage, kitchenette and small table.
- **Apartment:** larger open-plan unit with bed, lounge, dining and kitchenette zones.
- **Starter:** bedroom, sofa, coffee table and kitchen counters.
- **Family:** larger bedroom and living space with extra storage/furniture.
- **Mansion:** expanded room, premium lounge details, feature glazing and additional warm lighting.

Rooms use procedural Three.js geometry and built-in materials; no external models or textures are downloaded. The nine interior groups remain hidden until their property is entered, so normal city traversal does not render all rooms at once.

## Boundaries / limitations
- This is a local visual/gameplay prototype, not yet a persistent home customization system.
- Entry is not ownership-gated; purchases and wallet settlement remain disabled pending approved prices, payment integration, and finalized share rules.
- Furniture is static; doors do not animate and room collision is a simple movement clamp, not a full physics/navmesh implementation.
- Interior transforms, door reach, mobile controls, performance, and browser rendering still need hands-on visual QA. JavaScript syntax parsing passed after this change; that is not a substitute for browser testing.
- No merge or deployment is performed by this change.
