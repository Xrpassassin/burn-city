# Free base home styles · BURN City Estates

All five estate tiers (3 XRP trailer, apartment, starter home, family home, mansion) can choose **three architectural base styles** and **four curated exterior color palettes** at **no cost**. This is visual customization, independent of all XRP purchases.

- Architectural presets: **Classic** (masonry quoins and transom), **Modern** (clean metal fascia and vertical timber screening), **Rustic** (exposed timber corners, stone piers and warm lintels).
- Curated palettes: **Original**, **Coastal**, **Forest**, **Charcoal**.
- Real geometry, not just tint: details are tier- and footprint-aware and remain inside the original building collision volume. The existing 18 Tycoon items, tier footprints, paid prestige appearances, private hangar and roof pad are unchanged.
- An authenticated owner opens a property inspection, chooses a design and palette, previews the scene locally, and clicks **Save free style**. This uses an ordinary JSON HTTP POST, **not Xaman signing**, no invoice, no XRP, no receipt, no treasury transaction and no share-weight modification.
- Server stores only (property ID, allowlisted architecture, allowlisted palette, timestamp) in SQLite. Verified current owner is required to save. The appearance **follows the property on resale**; the former owner loses edit access. Only nonprivate style names are published to the island's public 30-second refresh feed.
- Guests and prospective buyers can experiment with the local preview, but cannot save before buying the estate. Closing inspection clears unsaved previews.
- Product copy must never imply free styling contributes additional market valuation, rewards, or financial entitlement.

## API

- Public GET `/api/estates/free-styles` returns a non-sensitive style list and approved choices, with uncustomized properties using the default locally.
- Authenticated GET `/api/estates/free-style?propertyId=...` returns verified owner's selection.
- Authenticated POST `/api/estates/free-style` with `{propertyId,architecture,palette}` persists a choice if the current owner matches the signed token. It is rate-limited and validates exact preset IDs.

## Visual art direction and material treatment

The free presets use a deliberately restrained, natural architectural palette. Each colorway is composed as a coordinated **wall, lighter trim, darker roof and front-door accent** instead of independently saturated colors:

- **Warm Neutral** (the existing `original` ID): warm limestone, cream trim, slate roof and walnut door.
- **Coastal:** soft sand stucco, weathered blue-grey siding, off-white trim and a muted sea-glass door.
- **Forest:** sage and warm ivory, moss-dark roofing and natural oak details.
- **Charcoal:** greige/charcoal walls, linen trim and warm honeyed wood. No pure-black wall blocks or bright-white trim.

The free base models themselves also gain more realistic semantic materials: painted cream window surrounds instead of dark window-box frames, intentionally colored doors, round soil-filled stone planters, a modern timber entry soffit, rustic knee braces, and a classic roofline cornice. These details are constrained to the original measured building envelope and do not interfere with paid progress, access gates, helicopter landings, or XRPL transactions.

The in-game picker shows matching wall/trim/roof/door swatches and a short description, helping owners choose one pleasant composition without memorizing RGB colors. Automated design checks assert restrained field/roof saturation, a lighter trim-to-wall relationship, roof depth, all five tier collision bounds and an actual geometry signature for each architecture. The WebGL smoke fixture now renders a mix of free variants on five tier lots instead of testing only the original appearance.

The style direction is grounded in traditional exterior design principles: muted low-chroma paint, material consistency, warm timber accents and restrained contrasts, **not** an imported third-party texture/model pack or photorealism guarantee. Handheld Safari readability and performance should continue to be observed as the broader island evolves.

## QA

Tests cover whitelist validation, persistence across store recreation, atomic ownership check on resale, public privacy, no XRP payment calls, all five tier build envelopes, material batching, local preview clearing, and prestige level coexistence.

Browser smoke tests should examine all five tiers, especially the taller apartment and mansion, using desktop Chromium and WebKit/mobile-sized layouts. This is an intentionally curated free personalization feature, not a full structural editor or custom texture upload.
