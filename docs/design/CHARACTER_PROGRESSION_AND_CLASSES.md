# BURN City Character Progression & Class Design Proposal

**Status:** Design proposal only  
**Audience:** Hark / gameplay implementation review  
**Compatibility target:** Existing browser-based Three.js client and Node server; no engine rewrite

## Decisions locked for this proposal
- **Class model:** Choose a class, then earn flexible specializations and weapon skills.
- **Respec policy:** Limited respecs; choices matter but are not permanently punitive.
- **Death policy:** Temporary recovery penalty; never delete or permanently drop equipped/inventory gear.

## Goals
1. Give characters a recognizable long-term identity inspired by classic MMORPGs.
2. Distinguish level, class mastery, weapon proficiency, equipment, and reputation.
3. Reward combat, quests, exploration, and group play without allowing client-side XP or stat forgery.
4. Support solo play and multiplayer roles, including on mobile.
5. Integrate incrementally with the current game instead of replacing combat, saves, inventory, or the server.

## Non-goals
- No new engine or parallel player-save system.
- No production class abilities before auditing current combat and persistence.
- No permanent item loss, corpse loss, or permanent death penalty.
- No monetized respecs or pay-to-win progression.
- No final balance claims; numbers are tuning proposals.

## Proposed progression layers

### 1. Character level
- Proposed initial cap: **50**, configurable.
- XP sources: validated enemy defeat contribution, completed quests, first-time exploration/discovery, and approved group/world objectives.
- Server awards XP only after validating the event and contribution. Never accept client-submitted XP totals, level, attributes, cooldowns, or reward amounts.
- Store current XP and level consistently; thresholds use one shared server-side function.
- Use a gently accelerating curve, then tune against measured playtime. Do not lock a final numeric curve until Hark identifies existing player stats and session/save behavior.
- Add anti-farm rules for repeated low-value kills, exploit loops, and duplicate event delivery.
- Reward events must be idempotent: the same event/reward ID cannot be claimed twice.

### 2. Attributes
Initial conceptual attributes:
- **Might:** physical force and selected heavy-weapon interactions.
- **Vitality:** health and resilience.
- **Agility:** mobility, evasion, and finesse weapon scaling.
- **Intellect:** arcane power and resource efficiency.
- **Spirit:** healing, resistance, and selected summoning/support effects.

Do not implement all five automatically if current combat has a simpler stat schema. Map concepts onto existing fields first. Avoid double-counting bonuses from class, level, equipment, and buffs. Prefer derived combat stats over duplicated mutable totals.

### 3. Class and specialization
Choose one base class at character creation. Each class has a baseline role, an ability family, and later specialization paths. Specialization is a build choice, not a second character-level system.

| Class | Core identity | Possible specialization paths |
|---|---|---|
| Vanguard | Defensive melee, shields, threat management | Bulwark (protection), Weaponmaster (weapon pressure) |
| Warden | Nature, healing, control, resilience | Grovekeeper (healing/control), Wildbound (nature offense/companions) |
| Arcanist | Arcane ranged damage and control | Spellfire (burst/area), Runeseer (control/utility) |
| Ranger | Bow, tracking, traps, wilderness mobility | Deadeye (precision), Trapper (control/ambush) |
| Reaver | Risk/reward melee and self-sustain | Bloodedge (sustain), Ravager (burst) |
| Binder | Bound creatures, debuffs, tactical support | Pactcaller (summons), Hexbinder (debuffs/control) |

These are original working names and concepts, subject to creative review. Do not copy EverQuest class names, lore, ability text, icons, or assets.

### 4. Weapon proficiency
- Track proficiency by weapon family only where existing equipment/combat data supports it.
- Proficiency improves through valid combat use, with diminishing returns and anti-exploit controls.
- Proficiency unlocks techniques or modest handling improvements; it does not replace character level.
- A class may have preferred weapons, but avoid hard-locking alternatives unless approved.
- Do not award proficiency from client-reported hits or server-rejected attacks.

### 5. Ability progression
- Abilities unlock at documented level and/or class-mastery milestones.
- Reuse the existing combat action, cooldown, target validation, and server-authoritative damage path.
- Define each ability with stable ID, class/spec eligibility, unlock requirement, resource/cooldown, target/range rules, telegraph, effect, counterplay, and mobile input.
- First integration should add only a tiny vertical slice (one class, two abilities) after the combat API is understood. Do not ship six classes full of untested abilities at once.

### 6. Limited respecs
Proposed rules for review:
- Class identity is chosen at character creation and is not casually swapped.
- Specialization/skill-point respecs are available through an in-world trainer or equivalent existing UI.
- Respec consumes a limited, earnable token or a clearly displayed escalating in-game cost; choose one after economy review.
- Show a confirmation summary before committing. Make the operation atomic with the character save.
- No real-money respecs in the initial system.
- Provide a recovery path for failed/partial respecs; never silently erase earned progression.

### 7. Death and recovery
- Death applies a temporary **Recovery** status, not permanent loss.
- No permanent gear/inventory loss; no corpse-looting requirement.
- Recovery may temporarily reduce outgoing damage/efficiency or limit a small resource benefit, but must not stack infinitely or make re-entry impossible.
- Proposed playtest duration: **2–5 minutes**, with visible timer and clear UI. Actual duration/effect require review.
- Repeated deaths must not create unbounded duration stacking. Reconnect must preserve remaining duration accurately.
- Safe zones remain safe; recovery cannot bypass protected-zone rules.
- Do not implement until server-side status expiry and persistence behavior are understood.

## Suggested data contract
Conceptual fields to adapt to existing saves:
- level
- experience
- classId
- specializationId (nullable until chosen)
- attributeAllocations or existing stat fields (one source of truth)
- weaponProficiency (only supported families)
- unlockedAbilityIds
- respecAllowance or economy ledger reference
- recoveryStatus with authoritative expiry timestamp, if approved

These are conceptual fields, not a mandate to rename or migrate live saves. Inspect the actual save schema and preserve backwards compatibility. Default absent optional fields when loading older characters; never reset existing player data to fit this proposal.

## Authority, persistence, and exploits
- Server is authoritative for XP, level-ups, stat derivation, ability unlocks, proficiency, respec transactions, and death/recovery status.
- Client sends intent; it does not send final reward or stat outcomes.
- Validate class/spec IDs against an allow-list.
- Validate level, XP, attribute allocations, proficiency, and timestamps at load and mutation boundaries.
- Make rewards and respec operations idempotent/atomic where persistence permits.
- Do not trust client time for cooldowns or recovery expiry.
- Log rejected progression mutations without logging secrets.
- Do not change the wire protocol until Hark identifies current message shapes and compatibility requirements.

## Implementation sequence

### Phase 0 — Audit (no gameplay changes)
- [ ] Identify canonical player save schema and load/save paths.
- [ ] Identify server-authoritative XP/reward handling, if any.
- [ ] Map current combat stats and how equipment/buffs modify them.
- [ ] Identify existing class/skill/ability concepts, if any.
- [ ] Document reconnect/death behavior and safe-zone enforcement.
- [ ] Identify protocol versioning and existing test harness.
- [ ] Report conflicts before proposing migrations.

### Phase 1 — Pure progression module
- [ ] Implement pure functions for XP threshold, level from XP, derived-stat calculation, and validation.
- [ ] Unit-test boundary cases and malformed values.
- [ ] Do not wire into live saves yet.

### Phase 2 — One-class vertical slice
- [ ] Add one class to a test-only or opt-in prototype.
- [ ] Implement two abilities through the existing server combat path.
- [ ] Persist XP/level with backwards-compatible defaults only after save audit.
- [ ] Test duplicate rewards, reconnect, invalid class IDs, and client forgery attempts.

### Phase 3 — Specialization, weapon proficiency, recovery
- [ ] Add specialization choice and limited respec transaction.
- [ ] Add one supported weapon proficiency family.
- [ ] Add temporary recovery only after timer/persistence tests.
- [ ] Measure balance and mobile UI before expanding the roster.

### Phase 4 — Expand content
- [ ] Add remaining classes and paths one at a time.
- [ ] Add class quests, trainers, group synergies, and regional unlocks as content permits.

## Acceptance tests before live integration
1. Client cannot grant itself XP, levels, attributes, abilities, proficiency, or respecs.
2. Duplicate reward/event IDs do not award XP twice.
3. Level thresholds work at 0 XP, just below threshold, exactly at threshold, and multi-level XP grants.
4. Invalid/unknown class and specialization IDs are rejected safely.
5. Existing saved characters load without losing inventory, stats, progression, or equipment.
6. A failed respec does not partially consume tokens or erase skill allocation.
7. Recovery expires correctly across reconnect/restart and cannot stack without bound.
8. Equipment, class, and level bonuses are applied exactly once.
9. Multiplayer clients agree on server-confirmed level and unlocks.
10. No regression to current combat, saves, inventory, loot, or progression.

## Decision gates for Hark
Before implementation, return:
1. Current architecture map with exact files/functions for saves, stats, XP/rewards, combat, and death.
2. Existing schema conflicts and migration risks.
3. Proposed minimal Phase 1 patch and tests.
4. Assumptions that require design approval.

**Do not merge this proposal as if it were a feature.** It is a reviewable specification; production changes should be separate, small PRs after the audit.


## Beta character translation: give players a choice

This project is in beta, so the progression model may be substantially redesigned. We do not need to preserve every legacy class rule forever. We should, however, give existing players transparent choices rather than silently forcing one conversion.

Recommended migration options at rollout:
1. **Translate existing character** into the new model using a documented mapping. Show a before/after preview of class, specialization, level/XP, abilities, stats, inventory, gear, and currency before confirmation.
2. **Start fresh** with the new model while keeping the old save available as a backup/export.
3. **Continue legacy or defer** only if the team can support it safely, with a clearly communicated transition window.

For old multiclass combinations with no obvious equivalent, offer a choice between valid mappings. Back up before migration; keep supported items; disclose any item/currency conversion; and make the migration idempotent so retries cannot duplicate rewards. If maintaining a legacy path is not feasible, be direct about that and provide a fair, well-explained beta transition. This policy permits meaningful redesign while respecting players' time and effort.
