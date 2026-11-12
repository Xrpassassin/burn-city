# BURN City Sketchfab props

The six UIDs in `sources.json` are already represented by the optimized City assets in `client/assets/props/`. The public attribution is in `client/city-credits.html`. The current exporter, `build_prop.py`, bakes static parts and pigeon poses for the instanced city renderer. Keep those assets as the distant representations when adding close-up animation.

Run `python3 scripts/city-props/inspect_props.py` from the repository root to check the bundled models, referenced buffers and textures, and mesh parts. For work that needs source clips, download the matching GLB through the authorized Sketchfab connection into a local staging folder as `<prop-id>.glb`. Then run:

```sh
python3 scripts/city-props/inspect_props.py --source-dir /path/to/staging duck vending
```

The output shows the actual clip names, ending keyframe times, and target nodes, as well as any mismatch with the bundled asset contract. Select clips by what they do in a preview. A listing's clip count does not identify a dispensing, swimming, or door motion. Keep raw archives out of the repository and keep attribution with any optimized assets.

| Prop ID | City behavior today | Gameplay integration and acceptance test |
| --- | --- | --- |
| `sliding-door` | Main Street panels slide on approach using baked frame, panel and travel data. | Reuse those parts in the Estates secret interior renderer. Connect to the existing hatch and property access flow in `estates-island-live.mjs`. Test authorized entry, closed-door collision, and holding the door open while a player occupies the opening. The bundled model supplies the panel motion. |
| `fisher-boat` | A decorative hull bobs at the fishing dock. | Use the hull as the skiff visual in `boat.js` and align the seat and waterline. Verify local and peer visuals, boarding, steering, fishing and dismounting. Test City-to-Estates boat travel separately since that depends on the world transition. |
| `duck` | Ducks bob and circle on the lake. | Inspect the original walk clip before adding a nearby shore walker. Keep land routes on solid ground and match the gait speed to movement. The current lake behavior can keep using the lightweight mesh. |
| `pigeon` | Sidewalk and plaza birds perch and fly away using baked wing poses. | For a smoother close-up, inspect flap and glide and blend them while the existing flight path controls the bird. Test takeoff, glide and distance swaps. |
| `vending` | Static collidable machines near shops. | Inspect the source clips for actual dispensing motion. Use a single interaction transaction with a busy state and a grant tied to its completion. Test rapid repeated input and interrupted interactions. |
| `arcade` | Static collidable cabinets at PIXEL ARCADE. | Mount a game surface on the cabinet, route keyboard and touch to an existing City game, and return walking input on exit. The cabinet's bundled body is enough to begin screen placement. |

Start with the bunker door and skiff using the bundled geometry. The cabinet can also be wired before downloading its source. Download the duck, pigeon, and vending originals when implementing their authored animations. Check each change on desktop and touch and keep the existing prop counts and distance culling.
