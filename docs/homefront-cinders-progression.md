# Homefront C.I.N.D.E.R.S. progression

Homefront's original fire-themed attribute system extends the existing level-30 server-owned RPG without resetting characters, equipment, XP or quests.

## C.I.N.D.E.R.S.

| Letter | Attribute | Theme |
| --- | --- | --- |
| C | Cinderheart | Endurance and toughness |
| I | Instinct | Perception and tracking |
| N | Nerve | Composure and precision |
| D | Dexterity | Agility and positioning |
| E | Engineering | Technical skills and repair |
| R | Resourcefulness | Scavenging and improvisation |
| S | Spirit | Leadership and teamwork |

Seven attributes start at 3/10. New characters receive 7 discretionary attribute points. One further point is earned at levels 5, 10, 15, 20, 25, and 30. Stats cap at 10. The server validates every upgrade and preserves unspent points. Legacy characters retain their existing XP, gear and skill ranks and receive the correct level-based attribute/perk budget retroactively.

## Level and skill progression

Existing level thresholds, XP sources, five original skills, equipment and quests remain. Field Medic and Wayfinder expand the trained-skill catalog to seven skills, all with five ranks. One manual skill point is earned per level after level 1. Familiarity comes from actual server events: marksmanship from infected kills, scavenging from loot, medicine and leadership from rescues, engineering from workdays, and Wayfinder from discoveries. Practice stages at 10, 30 and 70 verified actions earn small capped XP bonuses. Existing planned skill effects are NOT yet live combat, repair or healing bonuses.

An Ember perk point arrives every third level, beginning at level 3. Ten original single-rank perks have level, stat and occasionally skill prerequisites. Perks grant small, actual server-calculated XP advantages for particular earned actions. Salvage Eye increases the deterministic ordinary gear-find roll from 15% to 20%. No perk bypasses personal inventory, creates token payouts, or changes multiplayer combat balance.

## Server integrity

Attribute and perk actions are available only from the authenticated existing RPG POST route. Unknown attributes, perk IDs, synthetic levels and unearned spends are rejected. Normalization caps attribute scores, strips forged perk ownership, checks prerequisites and never accepts a client-specified XP amount. Level-1 profiles have 7 unspent attribute points; they have zero perk points and cannot buy locked perks. State remains in the original homefront-rpg.json account record.

## QA

Open Character with desktop C or the existing menu on mobile; assign attributes, then earn real XP, train skills and unlock Ember perks. Test a legacy profile, separate wallets, repeated clicks, prereq locks and maximum level. The Character tab should remain the single existing HUD overlay. Full gameplay stat effects on health, speed, damage, stealth and repair costs remain future balance work rather than unverified promises.

## Level-up feedback and safe skill practice

The existing Homefront HUD now checks the authenticated RPG sheet on an 18-second cadence while signed in. A confirmed increase in character level shows a short-lived, non-blocking level-up notice in normal page flow, outside the joystick area. It lists current unspent skill, attribute and Ember perk points and opens the same Character screen when clicked. Existing levels on the initial load are not announced, repeated polls do not replay a notice, and a signed-out user clears the previous profile state.

Skill-use XP bonuses are earned exclusively for genuine, positive-XP sources in the existing PRACTICE catalog. World entry itself is **zero XP**, remains zero after hundreds of entries, and can never become an infinite practice XP farm. Unrelated event types do not receive familiarity bonuses.
