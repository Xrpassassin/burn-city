# Pirate bartender and Ember Bar upgrade

Put [RYStudio's Pirate Crew](https://sketchfab.com/3d-models/pirate-crew-4b89df2e934f43228ff8d982dea4cba1) ([share link](https://skfb.ly/pLN88)) behind the counter at **The Ember Bar**, on the west mezzanine in BURN Tower. The Ember Bar already has a three-drink menu and an arrival point in the tower directory. This makes the existing bar the first choice for the bartender. The rooftop Sky Bar currently has an informational prompt, and Blacktide's Salt Lantern already has Silas Reed for its story interaction.

## Import and credits

- The Sketchfab listing describes a female pirate, offers a free download under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), and reports 443.2k triangles. Confirm the source archive's rig, clips, textures, and any display base before import.
- Export an optimized local glTF/GLB with baked surface detail and mobile-sized textures. Keep her recognizable silhouette. Remove any display base and place her feet on the mezzanine floor. If the source lacks a usable rig, rig just what the service needs and author simple in-place Idle and Serve clips. Verify the reach against the counter and cup props.
- Add the title, artist, source URL, license, and modification notes to [city credits](../client/city-credits.html) via [the credits generator](../scripts/city-citizens/write-credits.mjs).

## Upgrade the bar and serve drinks

- In [tower-interior.js](../client/js/tower-interior.js), use `barAndLounge()` and the existing `bar` station. Place the bartender in a recessed service area behind the counter, facing the guest approach. Adjust counter depth if needed to give her clearance. Keep a clear lane around the stools and mezzanine walkways and retain the directory arrival point and keyboard/touch interaction.
- Keep the Ember Bar's stone and brass look. Give the service counter a dark, textured front, warm under-shelf lighting, grouped bottles and glassware, and a distinct serving spot with a mat and a cup. Use shared materials and instancing for repeated props. Light the bartender's face and hands from the guest side so the service reads from the walkway.
- Use the existing `showBarMenu()` entries for Cinder Tea, Ember Fizz, and Blackglass Tonic. Selecting a drink should close the menu, play a short serve animation, and place the matching cup on the counter with a brief confirmation. Keep orders cosmetic and free. Handle repeat taps while serving and clear the active order, prop, and animation when leaving the interior.
- Load the bartender only when the bar is relevant. Keep the menu and cup feedback usable if the model or animation fails to load. Reuse one rig and cup setup across repeat visits.

## Check before merge

- [ ] Visit from the tower directory and on foot. Open the menu using keyboard and touch, order each drink, and verify the visible service and cup placement.
- [ ] Check the bartender's scale, lighting, hand contact, and floor contact. Walk around the stools and nearby lounge. Verify the rooftop and Blacktide tavern interactions still work.
- [ ] Check repeat orders, closing the menu, exit and re-entry, and a simulated model load failure. Verify orders leave inventory and currency balances intact.
- [ ] Compare before/after screenshots from the mezzanine approach and counter on desktop and phone. Check load time and frame time and confirm the published credit.
