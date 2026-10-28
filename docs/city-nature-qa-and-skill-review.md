# City nature pass — design, accessibility and security review

This checklist applies external **ideas**, not third-party code. Reference catalog: https://skill-issue.in/ (agent skills directory); relevant references include Vercel web-design-guidelines, accessibility-compliance, ui-ux-pro-max-skill. No skill scripts, installers or packages are dependencies of this PR.

## BURN City acceptance criteria

- **World readability:** Plants frame paths and landmarks without obscuring the BURN Tower entrance, bridges, roads, lake access, forest sign, interaction prompts or player visibility.
- **Spatial fidelity:** No greenery clipped through roads, existing buildings, pavement or water. Explicit collision clearance must be tested on the city scene; pure placement-unit tests alone are insufficient.
- **Visual identity:** Use varied local-height grasses with intentionally sparse flowers; avoid identical grids, oversaturated neon grass, and excessively bright highlights at night.
- **Rendering budget:** Grass/meadow dressing stays within two extra instanced batches; counts capped by quality tier. Verify low-tier mobile frame pacing and memory, not just draw counts.
- **Reduced-motion support:** This pass adds no motion or flashing vegetation. Any future wind animation must honor reduced-motion preferences.
- **Accessibility:** Preserve mobile tap targets, high-contrast interface labels and navigational sightlines; nature must not hide interactive cues.
- **Rollback:** The existing `?nonature` switch disables the new pass without affecting anything else. Leave this available during rollout.
- **Security and licensing:** No remote mesh downloads, unreviewed npm installation, agent skills or executable AI instructions are imported. Review asset license and source before introducing any external models.
- **QA before merge:** Confirm PR CI, perform desktop and real phone visual checks, and verify navigation through forest entrance, tower, bridges, Estates access and lake roads. Do not equate CI green with successful scene QA.

## Expansion order

1. Complete the grass-only rollout and test terrain/clipping in situ.
2. Add curated nature clusters with safe road/interaction clearance, keeping scenery cosmetic.
3. Improve shoreline rocks/reeds with an explicit water exclusion boundary.
4. Explore optional ambient bugs/birds only after graphics profiling; no new behavior loops in the first pass.
