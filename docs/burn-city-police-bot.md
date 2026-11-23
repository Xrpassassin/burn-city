# Police Bot officers for Burn City

Use [Police Bot by Sviatoslav](https://sketchfab.com/3d-models/police-bot-81fa5cfa3a8e483b8fb8bf42bc3377a9) ([original share link](https://skfb.ly/6XMCE)) for Burn City's on-foot police NPCs. The listing offers a free download under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) and names [Johnson Ting's concept](https://www.artstation.com/artwork/m9R28) as inspiration. The listing reports 1.4 million triangles. The source archive, rig and animation clips still need inspection.

## Prepare the model

- Download the original from Sketchfab using the authorized account. Keep the source archive out of the deployed game. Retopologize or decimate to near and far meshes, bake surface detail, and resize textures for desktop and mobile. Preserve the original helmet, torso and leg silhouette.
- Inspect the skeleton and clips in the archive. If a usable rig is absent, use a mechanical rig with rigid limb segments and simple in-place Idle and Walk clips. Keep rotation pivots at the joints, scale to the precinct entrance, and match walk phase to distance traveled so the feet stay planted. Export the optimized runtime models as local glTF/GLB.
- Add the source, artist, license and modification notes to the generated [city credits](../client/city-credits.html) via [the credits generator](../scripts/city-citizens/write-credits.mjs). Retain the concept reference from the listing and review it alongside the model license before shipping.

## Integrate the officers

- Start with one bot on station duty and one on a short sidewalk patrol near Precinct 1. The precinct and its door come from `L.police` in [citylife.js](../client/js/citylife.js). Place the officers clear of the entrance and vehicle bays. Keep vehicle dispatch and AEGIS escalation in [events.js](../client/js/events.js) working as they do today.
- Reuse the named-agent, movement and distance-based animation patterns in [citizens.mjs](../client/js/citizens.mjs). Model IDs in its generic crowd currently rotate across the entire manifest. Keep Police Bot restricted to police agents so civilian shoppers and pedestrians retain their civilian models. Calloway's precinct visit is a civilian schedule stop.
- Load the bot independently of civilian models so a failed bot download leaves civilians and police dispatch working. Keep a lightweight officer fallback and use the reduced mesh or cull distant officers within the existing mobile budget.

## Check before merge

- [ ] Desktop and phone show a station bot and a patrolling bot. Check grounded idle, natural turns and walk cycles, model swaps, and a full patrol loop with the station door and vehicle bays clear.
- [ ] The regular crowd and named civilian schedules render normally. Police cars still respond to incidents and patrol when AEGIS escalates.
- [ ] Simulate a missing bot asset and confirm civilians still load and the precinct stays usable.
- [ ] Check mobile load time and frame time around the station, verify the rendered credit, and run `npm run test:citizens`.
