# Shared airport banner aircraft

This branch adds a lightweight procedural propeller aircraft and tow banner to the existing airport scene in `client/js/airport.js`.

## Current implementation
- Reuses the existing Three.js scene, airport group, renderer, and update loop; no new runtime dependency.
- Adds two small procedural aircraft with animated propellers and trailing banner meshes.
- Alternates the banner designs between **Eternal Grind** and **Light Cycles**.
- Uses an epoch-based deterministic route so clients with aligned system clocks derive the same aircraft phase and positions instead of independently rolling random flights.
- Keeps the aircraft local to the existing airport scene and does not alter game-server protocols.

## Important limitations
- The supplied promotional images are not yet checked into the repository, so the first pass uses canvas-rendered banner artwork with the correct names and visual palettes. Replace these textures with optimized versions of the originals once the image files are added to the repo.
- Position agreement is clock-derived, not server-authoritative yet. Clients with skewed system clocks can disagree slightly; a later networking pass should publish a server timestamp/flight snapshot and have clients interpolate it.
- This is a first implementation pass; browser, mobile, performance, and visual validation are still required.

## Review checklist
- [ ] Check aircraft heading and runway taxi alignment in the browser.
- [ ] Confirm banners remain readable and trail behind the aircraft at ground-view distances.
- [ ] Validate mobile frame time and reduced-quality tiers.
- [ ] Replace placeholder canvas banner art with optimized source artwork.
- [ ] Upgrade to server timestamp/snapshot synchronization before adding player interactions.