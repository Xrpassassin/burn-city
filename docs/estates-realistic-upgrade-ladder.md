# BURN City Estates — realistic property-upgrade ladder

Design status: approved direction, **implementation staged**. This document distinguishes the existing 18 ledger-backed Tycoon item IDs from future concepts. No new XRP payment products are activated by this design. Do not alter previous receipts or enable the `ESTATE_TYCOON_UPGRADES_ENABLED` flag as part of a visual-only change.

## The rule for every estate

Every purchase must produce an **identifiable permanent change**: an exterior fixture, realistic structural/detail improvement, or an authenticated enterable interior. Use measured lot-local dimensions, appropriate supporting structures, plausible material finishes, anchored paths and clear sightlines. Buildings must remain in their assigned **20 × 18 metre lot** and may never obstruct the public roadway, neighboring property, or usable entrance. Purchases are attached to the property on resale.

**Presentation target:** believable compact game-world architecture (real-world proportions, appropriate construction details, varied roughness/metal/glass/warm lighting), not a promise of photorealism. Keep high object detail where the player actually walks; use instancing and/or level-of-detail later for performance.

### Existing universal catalogue (prices already in code)

| Existing upgrade ID | XRP | Prerequisite | Exterior expression | Interior / interaction | Recorded share units |
| --- | ---: | --- | --- | --- | ---: |
| `porch-lights` | 3 | — | Wall-mounted sconces, low path bollards; warm halos | Ambience only | 1 |
| `flower-garden` | 3 | — | Layered flowerbeds, wood edging, planters | Ambience only | 1 |
| `custom-sign` | 3 | — | Post-and-beam house sign with street-visible plaque | Static sign, not a free-text billboard | 1 |
| `cozy-awning` | 6 | — | Roof/patio canopy aligned to door, timber brackets and supports | Exterior shelter | 2 |
| `privacy-fence` | 6 | — | Fenced boundaries with a clear open entrance/gate and footpath | Exterior privacy | 2 |
| `fire-pit` | 6 | — | Stone hearth with contained embers and safe paving | Yard ambience | 2 |
| `game-lounge` | 9 | — | Discreet entrance-side game-room identity plaque/window glow | Server-gated arcade room | 3 |
| `garden-pond` | 9 | `flower-garden` | Stone-rimmed basin in side-yard landscape | Exterior ambience | 3 |
| `reinforced-floor` | 9 | — | Concrete service slab / concealed footing in clear side-yard strip | Starts hidden floor chain | 3 |
| `grow-lounge` | 9 | `reinforced-floor` | Concealed louvered ventilation and service access | Server-gated decorative greenhouse lounge | 3 |
| `hobby-workshop` | 12 | — | Small utility door, venting and work-area sign | Server-gated workbench room | 4 |
| `roof-garden` | 15 | `flower-garden` | Planter/railing grouping on flat roof; supported raised garden pergola where the roof is pitched | Ambience, no floating planters | 5 |
| `hidden-hatch` | 18 | `reinforced-floor` | Steel hatch, hinges and weatherproof rim at the prepared slab | Leads to private-room access | 6 |
| `grow-lounge-deluxe` | 18 | `grow-lounge` | Second discreet duct / planter architecture | Server-gated deluxe private lounge | 6 |
| `security-upgrade` | 21 | `privacy-fence` | Door reinforcement, wall-mounted cameras, controlled-entry fixture | Visual security; don't imply working surveillance | 7 |
| `underground-bunker` | 30 | `hidden-hatch` | Reinforced hatch lid with lamp, vent riser and concrete trim | Server-gated bunker room | 10 |
| `bunker-arcade` | 36 | `underground-bunker` | Concealed cable/service housing, no exposed arcade in street | Server-gated vault arcade | 12 |
| `estate-helicopter` | **60** | Family Home or Mansion only | Rooftop pad with genuine support structure and aircraft (kept within the lot) | Owner-only local aviation + private Hangar Logbook | 20 |

All existing prices use `1 XRP = 1,000,000 drops`; recorded upgrade-share units equal XRP/3. They **do not affect live reward payout weights**, create an investment claim, or promise profit. No property-price changes accompany this design.

## Five tier-specific upgrade ladders

The tables are architectural *presentation mappings* for the existing catalogue. A smaller property gets a modest version of the same owned ID; a mansion gets a more finished version. For future *new SKUs*, exact suggested prices are listed separately and are **NOT purchasable or yet implemented**.

### Trailer · property price 3 XRP

| Stage / cost | Required item(s) | Realistic outcome |
| --- | --- | --- |
| Arrival · 3 XRP | Porch lights | Two compact wall sconces and short lit walkway |
| Curb appeal · +3 XRP | Flower garden | Reclaimed-timber flower boxes along the access path |
| Shelter · +6 XRP | Cozy awning | Short supported metal or canvas-style front canopy |
| Secure lot · +6 XRP | Privacy fence | Low slatted fence, explicit gap for the entrance |
| Hidden hobby · +9 XRP | Reinforced floor | Narrow pad and realistic concealed utility hatch base |
| Private retreat · +9 XRP | Grow lounge after reinforced floor | Small ventilated room behind the existing compact property |
| Emergency access · +18 XRP | Hidden hatch after reinforced floor | Hinged side-yard hatch with flush concrete edge |

**Design-only future trailer offers:** utility shed **6 XRP** after awning; upgraded siding and gutters **9 XRP** after porch lights; rear deck **12 XRP** after awning. Not in the current server item catalogue.

### Apartment · property price 15 XRP

| Stage / cost | Required item(s) | Realistic outcome |
| --- | --- | --- |
| Entry polish · 3 XRP | Porch lights | Entry sconces and improved shared walkway lighting, no isolated garden poles |
| Signage · +3 XRP | Custom sign | Wall-adjacent numbered plaque, not a lawn billboard |
| Balcony atmosphere · +3 XRP | Flower garden | Narrow planters without blocking accessible paths |
| Entry awning · +6 XRP | Cozy awning | Compact supported exterior door canopy |
| Social upgrade · +9 XRP | Game lounge | Discreet identity plaque and authenticated arcade interior |
| Roof retreat · +15 XRP | Roof garden after flowers | Supported flat-roof terrace planters and safety border |

**Design-only future apartment offers:** interior kitchenette **9 XRP** after game lounge; acoustic lounge walls **12 XRP** after game lounge; roof seating pergola **18 XRP** after roof garden. Not purchasable.

### Starter Home · property price 75 XRP

| Stage / cost | Required item(s) | Realistic outcome |
| --- | --- | --- |
| Warm arrival · 3 XRP | Porch lights | Matched door sconces and two driveway/path fixtures |
| Garden · +3 XRP | Flower garden | Perimeter planter beds and flowers |
| Covered entry · +6 XRP | Cozy awning | Wood-framed canopy aligned with main doorway |
| Privacy · +6 XRP | Privacy fence | Wood slat panel fence, open walk-through gate |
| Yard feature · +6 XRP | Fire pit | Small paved stone hearth that fits the narrow side yard |
| Hidden retreat · +9 +18 XRP | Reinforced floor + hidden hatch | Reinforced slab and concealed hinged hatch in the service yard |
| Underground space · +30 XRP | Bunker after hatch | Private guarded room, with real surface vent and access light |

**Design-only future starter offers:** side-yard workshop shed **12 XRP** after workshop; pergola seating **15 XRP** after awning; covered garage bay **24 XRP** after privacy fence, subject to lot-space validation. Not purchasable.

### Family Home · property price 150 XRP

| Stage / cost | Required item(s) | Realistic outcome |
| --- | --- | --- |
| Polished entry · 3 + 6 XRP | Porch lights + awning | Full supported covered entry, warm lighting and step detailing |
| Landscaped yard · +3 + 9 XRP | Flower garden + pond | Planted side-yard strip and stone basin |
| Family courtyard · +6 + 6 XRP | Privacy fence + fire pit | Protected side-yard patio with garden lighting |
| Private workshop · +12 XRP | Hobby workshop | Utility wall, service door and authenticated indoor room |
| Secure facility · +21 XRP | Security upgrade after fence | Door hardware and eave-mounted cameras |
| Private bunker · +9 +18 +30 XRP | Reinforced floor → hatch → bunker | Discreet external entrance and fully rendered private room |
| **Aviation · +60 XRP** | Helicopter; no additional prerequisite | Rooftop pad, structural pylons, local aircraft, private logbook |

**Design-only future family offers:** outdoor kitchenette **12 XRP** after awning; supported garden trellis **15 XRP** after roof garden; small private screening room **24 XRP** after game lounge. Not purchasable.

### Luxury Mansion · property price 300 XRP

| Stage / cost | Required item(s) | Realistic outcome |
| --- | --- | --- |
| Formal arrival · 3 + 3 XRP | Lights + sign | Styled matching entry fixtures and discreet property plaque |
| Architectural finish · +6 + 21 XRP | Fence → security upgrade | Refined gate detail, mounted cameras and reinforced private entrance |
| Landscape design · +3 + 9 XRP | Flowers → pond | Layered side-yard planting, paved stone basin |
| Covered terrace · +6 + 15 XRP | Awning + roof garden after flowers | Deep timber bracket canopy, safe terrace planting around existing roof geometry |
| Secret suite · +9 + 18 XRP | Grow lounge → deluxe lounge after reinforced floor | Owner/invited-guest interiors with a believable service vent |
| Bunker vault · +9 +18 +30 +36 XRP | Floor → hatch → bunker → arcade | Hidden secured surface entrance and private vault entertainment |
| **Private aviation · +60 XRP** | Helicopter | Roof-mounted aircraft + pad with structure and logbook; avoid overlapping garden |

**Design-only future mansion offers:** illuminated stone entrance **12 XRP** after porch lights; roof observatory/cocktail deck **24 XRP** after roof garden (cannot coexist in the pad footprint without redesign); cinematic screening room **30 XRP** after game lounge; full landscape expansion / pool **not priced** until a larger lot and collision plan exists. Not purchasable.

## Production implementation order

1. **Current IDs first**: align every existing 3D exterior feature with the actual footprint, keep all props grounded inside lot dimensions, and ensure interior upgrades get a subtle exterior indication rather than a floating model.
2. **Tier-aware details**: small fixtures for Trailer/Apartment, detailed structural supports for Family/Mansion, weather/roof-aware planters, no floating roof installations.
3. **Visual QA**: test the rendered upgrade combination against the actual house geometry, neighbor buffers, front gate/approach and the helicopter pad.
4. **Interaction QA**: keep verified owner / invited guest ACL, room return flow, and private hangar authorization unchanged. Avoid pretending passive lights or cameras are active gameplay systems.
5. **Only then consider new payment SKUs**: design-only rows become purchasable only after separate catalogue, price, visuals, verification, treasury, legal and user experience reviews. Preserve all historical priced orders and current disabled payment gate.

Use believable game art: textured or color-varied rough stone, timber slats and posts, weatherproof flashing, safety rails, vents, modest lighting and proportionate doors. Avoid photorealism claims until externally sourced, licensed assets and actual browser GPU QA are completed.
