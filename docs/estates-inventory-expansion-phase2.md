# Estates Island — residential inventory expansion (phase 2)

The live November 10 ownership snapshot showed 4 original trailers (2 sold, 2 unsold), 21 catalogued properties total. This release adds **12 real, permanent 3D plots** on the existing island rather than selling unplaced entries.

| Tier | Before | New | After | Price per estate |
| --- | ---: | ---: | ---: | ---: |
| Trailer | 4 | 6 | 10 | 3 XRP |
| Apartment | 3 | 0 | 3 | 15 XRP |
| Starter home / cabin | 6 | 4 | 10 | 75 XRP |
| Family home | 4 | 2 | 6 | 150 XRP |
| Mansion | 4 | 0 | 4 | 300 XRP |
| **Total** | **21** | **12** | **33** | Existing tier prices |

**Property IDs and placement are immutable.** The original 21 catalogued properties retain their historical catalog order, verified ownership, asset purchase price and 3D lot coordinates. The appended properties are trailers 05–10, starter houses 05–08, and family houses 05–06.

## Island layout

Twelve new 20 × 18 m lots have measured coordinates across North Shore, East/West Village and South Grove / Woodland Edge. No parcel crosses another, the shoreline lake or a public amenity; each has a playable house shell and navigable inspection approach. Three stone pedestrian walkways provide circulation between nearby plots without overwriting the long-standing road network or building over private property. The island remains one open neighborhood with the same shoreline, bridges, fishing, helicopter eligibility and walkable routes.

The existing neighborhood renderer automatically gives every new plot its own mailbox (33 total), while the 16 streetlights stay in place. New properties automatically inherit their tier's existing free exterior styles, enterable residence functionality where deployed, Tycoon rules, per-wallet cap and purchase flow. No new XRP payment endpoints, payouts, guaranteed yields, currency conversions or treasury allocation rules were introduced.

## Buyer experience and operational safeguards

The expanded property catalog is available in the same Estates browser directory. A responsive tier selector and unowned-only toggle help users browse 33 entries. Shown counts reflect public ownership; an unowned property can still be reserved or otherwise unavailable when a buyer checks out. All purchases remain subject to the existing live server, ownership, wallet cap and ledger confirmation checks. At the prior snapshot of two sold trailers, the new total of 10 would yield 8 unowned trailers after deployment, assuming no intervening purchases.

## Validation and release gates

The dedicated expansion test checks all 21 original lot positions, every new address and slot, dry-land plot corners, paths, lake safety, public landmark and tree setbacks, unique parcel/mesh IDs, new mailboxes, route approaches, quotation prices and five-per-tier wallet restrictions. Focused CI also runs rendering/navigation and economic quote/tier tests.

New offerings can grow future total economic share units as they are bought. No promised return, fixed yield or guarantee; real reward computation remains tied to settled profits under existing policy.
