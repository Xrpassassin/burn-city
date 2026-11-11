# Estates Island · public street furniture

Street fixtures are public, decorative environment objects and **not** property upgrades. They introduce no XRP payments or entitlement changes.

- **16 warm-white architectural streetlamps** follow measured north–south, east–west and east/west loop roads. Steel poles, concrete footings, curved-looking lamp heads and restrained warm lens glow improve night-time wayfinding. Only three GPU point lights are used in the instanced group; the other glass lenses are emissive for low mobile cost.
- **One mailbox for each catalogued property**, positioned at the right-front corner inside the existing 20×18m plot but outside every home footprint. A capped steel/wood post, rounded top, front slot, door and red collection flag make each mailbox legible at walking distance. Families/mansions use more substantial masonry bases.
- **Three district signposts and three public waste bins** at plaza/market/kiosk approaches, designed to anchor the shared neighborhood without introducing interactions that claim payment or private ownership.
- The entire group uses a single material/geometry instancing pass; fewer than 14 draw batches and zero third-party asset downloads. The island scene manifest includes fixed fixture placements, and navigation uses only their actual compact base radii for collision. Road traversal and driveway approaches remain open.

Tests validate the 16 lamp positions, one-to-one mailboxes for mapped lots, property setbacks and public road links, deterministic coordinates, full island scene integration, collision bases, instancing and real Chromium/WebKit WebGL screenshots.

This PR does **not** enable residential interior editing or any unverified furniture purchase. Those follow a separate server-authorized free layout/furniture flow and gated XRP layout SKU design.
