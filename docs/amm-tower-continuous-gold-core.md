# AMM bridge → tower seamless flow and permanent LP gold cores

The AMM's existing activity color (quiet blue → purple → orange → active red) remains identical along each bridge and the spiral descending around its destination tower. The rail and spiral now blend to the same core color and radius at their shared endpoint. A smooth inward radius profile eases the tail toward the building facade and fades instead of abruptly flaring away or changing material.

## Gold has an auditable denominator

The older gold orbit rings and chain halos are removed from the bridge and tower views. One *physically modeled* gold core tube runs through each pool's rail and its tower helix, drawn in one merged GPU batch across the city.

- **Width encodes verified, permanently locked LP share:** `gold radius / colored core radius = 0.88 × sqrt(verified locked LP fraction)`. At 25% of LP supply black-holed the gold bar has half the radius it would at a 100% lock, giving proportionate cross-section area. This gives a high locked **proportion**, not high absolute dollar TVL, the thickest gold bar relative to the colored line.
- **Verified only:** sourced from `/api/amm-lock`, which classifies AMM LP holders with validated `account_info` flags / signer lists and expires the verification after 6 hours. If there is no fresh verification, the gold tube collapses to zero; reported-only `locked_pct` never creates a false verified gold bar.
- **Not token burns:** XRPyro or BURN burned supply is independent from LP locked inside an AMM; time-locked Escrow LP positions are also excluded. The old strict `BCGold.isGold` 95% / 5,000 XRP criterion still controls special certification badges (and existing historical `∞ FOREVER` signage), not partial-lock bar thickness.
- **BURN/XRP is data-driven:** if a fresh LP check establishes the largest locked share, its relative core will be thickest. No ranking is hardcoded based on community assumptions.

The new core shares its centerline with the animated rail and swirl, uses shader-scaled cross sections (no geometry reallocation on 10-minute verification), keeps the neon activity shell intact, and maintains one merged draw call for all gold tubes. The old ring draw call is removed; separately certified side rails are also removed so gold is readable inside the flowing bridge.

### Visual QA

- `node test/amm-gold-vein-profile.test.mjs` tests monotonic thickness, LP denominator, 0 for unknown, smooth radius, safe support clearance and fade.
- `node test/amm-lock-sim.js` and `node test/goldlock-sim.js` retain account verifier and strict gold rule coverage.
- `scripts/amm-gold-vein-browser-preview.mjs` runs the actual city using synthetic verified lock fixtures in Chromium and WebKit at desktop/mobile viewports; checks gold geometry, 0-valued unverified pools, continuous spiral presence and shader errors. Evidence is stored in GitHub Actions artifacts. Synthetic fixtures must never be mistaken for live BURN/XRP locking measurements.

This is presentation-only. No XRPL writes, AMM trading, property payments, rewards, LP unlocks, liquidity amounts or treasury policy changes.
