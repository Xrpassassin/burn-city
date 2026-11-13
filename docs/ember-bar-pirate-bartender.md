# Pirate bartender and Ember Bar upgrade

Put [RYStudio's Pirate Crew](https://sketchfab.com/3d-models/pirate-crew-4b89df2e934f43228ff8d982dea4cba1) ([share link](https://skfb.ly/pLN88)) behind the counter at **The Ember Bar**, on the west mezzanine in BURN Tower. The Ember Bar already has a three-drink menu and an arrival point in the tower directory. This makes the existing bar the first choice for the bartender. The rooftop Sky Bar currently has an informational prompt, and Blacktide's Salt Lantern already has Silas Reed for its story interaction.

## Import and credits

- The Sketchfab listing describes a female pirate, offers a free download under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), and reports 443.2k triangles. Confirm the source archive's rig, clips, textures, and any display base before import.
- Export an optimized local glTF/GLB with baked surface detail and mobile-sized textures. Keep her recognizable silhouette. Remove any display base and place her feet on the mezzanine floor. If the source lacks a usable rig, rig just what the service needs and author simple in-place Idle and Serve clips. Verify the reach against the counter and cup props.
- Add the title, artist, source URL, license, and modification notes to [city credits](../client/city-credits.html) via [the credits generator](../scripts/city-citizens/write-credits.mjs).

## Upgrade the bar and serve drinks

- In [tower-interior.js](../client/js/tower-interior.js), use `barAndLounge()` and the existing `bar` station. Place the bartender in a recessed service area behind the counter, facing the guest approach. Adjust counter depth if needed to give her clearance. Keep a clear lane around the stools and mezzanine walkways and retain the directory arrival point and keyboard/touch interaction.
- Keep the Ember Bar's stone and brass look. Give the service counter a dark, textured front, warm under-shelf lighting, grouped bottles and glassware, and a distinct serving spot with a mat and a cup. Use shared materials and instancing for repeated props. Light the bartender's face and hands from the guest side so the service reads from the walkway.
- Use the existing `showBarMenu()` entries for Cinder Tea, Ember Fizz, and Blackglass Tonic. Offer the 1 XRP checkout described below. Serve the matching cup after confirmation. Handle repeat taps while serving and clear transient props and animations on exit while preserving the server order and receipt.
- Load the bartender only when the bar is relevant. Keep the menu and cup feedback usable if the model or animation fails to load. Reuse one rig and cup setup across repeat visits.

## 1 XRP drink checkout and celebration

- Show **Buy for 1 XRP** beside each house special. Treat this as a flat-price cosmetic purchase and label the recipient as the BURN City treasury before opening Xaman. Use the server's existing `TREASURY_ADDRESS` (`C.TREASURY` in [config.js](../server/config.js)). Use the existing Xaman sign-in and payment patterns in [payments.js](../server/payments.js) and [jetpack.js](../server/jetpack.js), with a dedicated Ember Bar order and receipt. Keep a free preview available so players can try the bar without a wallet.
- Create a server-owned order bound to the signed-in wallet, drink, expected destination, network, and unique order reference. Build the Xaman payment for exactly `1000000` drops, including any configured destination tag and the order reference. Let the wallet show its separate network fee. Show pending, declined, expired, and confirmed states and resume pending orders after returning from Xaman or reloading. Disable paid checkout when payment configuration is unavailable.
- Treat Xaman's signed transaction hash as a lookup hint. Confirm a validated `Payment` with `tesSUCCESS` on the expected ledger. Match sender, destination, tag if required, and order reference. Require native XRP `meta.delivered_amount` of exactly `1000000` drops and reject partial payments. Persist the transaction hash and order settlement atomically, enforce uniqueness, and make retries return the same receipt. Reference [XRPL transaction metadata](https://xrpl.org/docs/references/protocol/transactions/metadata).
- On first confirmed fulfillment, have the bartender do two quick, joyful full-body hops, then serve the selected drink. Keep the jump and landing behind the counter and run the serve clip after her feet settle. Tie the animation to the confirmed order so polling, refreshes, and double taps cannot trigger another celebration or charge. If the model or clip is missing, show the paid receipt and cup. If the player is away when payment validates, let them collect the confirmed order on return without paying again.

## Blackbeard, the bar regular

- Seat [FrandProductions' Blackbeard-inspired model](https://sketchfab.com/3d-models/3d-model-inspired-of-blackbeard-767621822b7a4711889fbdfb11de3011) ([share link](https://skfb.ly/pxsQJ)) at a side stool at The Ember Bar, within earshot of the mezzanine walkway and clear of the service spot. Sketchfab lists the model as a free [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) download, generated with Meshy, at 288.7k triangles. Check the archive for a rig and clips, reduce the mesh and textures for mobile, and credit the source and modifications alongside the bartender.
- Let the bartender bring him a mug. Over a few sips, transition from seated idle to a loose sway and slurred delivery. When a player passes nearby, have him turn his head and mutter a short pirate line. Examples: “I’m not swayin’. The whole tower’s at sea.” and “Easy there, deckhand. You’re makin’ the floor roll.” Keep the mug at his seat and the effect on Blackbeard.
- Reuse the tower's frame update and interior lifecycle. Trigger banter when a player enters range on the mezzanine, with a cooldown and line rotation so standing near him or pacing past him never spams the same line. Show a nearby subtitle and use positional audio if a voice clip is available. Clear dialogue and stop animation/audio on exit. Keep his service and chatter independent of player drink orders.

## Check before merge

- [ ] Visit from the tower directory and on foot. Open the menu using keyboard and touch, order each drink, and verify the visible service and cup placement.
- [ ] Check the bartender's scale, lighting, hand contact, and floor contact. Walk around the stools and nearby lounge. Verify the rooftop and Blacktide tavern interactions still work.
- [ ] Check repeat orders, closing the menu, exit and re-entry, and a simulated model load failure. Verify drinks stay cosmetic and the preview leaves wallet balances intact.
- [ ] Compare before/after screenshots from the mezzanine approach and counter on desktop and phone. Check load time and frame time and confirm the published credit.
- [ ] Watch Blackbeard receive a mug, sip, and become visibly tipsy. Walk past repeatedly, wait nearby, change floors, and exit and re-enter on desktop and phone. Confirm readable subtitles, restrained repeat frequency, and a clear route to the counter.
- [ ] On XRPL Testnet, verify a confirmed purchase credits the configured treasury exactly 1 XRP and plays one celebration. Check cancellation, wrong payer/destination/reference/amount, partial payment, unvalidated transactions, replayed hashes, double taps, refresh during checkout, and confirmation while away from the bar. Confirm paid pickup survives re-entry and the UI shows the receipt when animation is unavailable.
