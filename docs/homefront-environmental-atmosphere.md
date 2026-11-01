# Homefront Environmental Atmosphere Pass

**Scope:** visual-only atmosphere that gives districts distinct identities while preserving server-authoritative combat, terrain, weather-free survival simulation, loot and movement.

## Existing effects reused

- **Fog:** existing Three.js `FogExp2` gets smoothly blended color and a small density adjustment. Maximum `0.0055` (still readable at medium distance).
- **Sky:** recolors the existing scene background. No HDR maps, extra sky meshes, shaders or bloom.
- **Ash:** reuses the existing 150-point batch; low-amplitude directional gusts change every 90-second time bucket. No new particles, no physics or network calls.
- **Interiors:** authenticated authored rooms stop the outdoor ash, use sheltered low-density fog and a distinct powered/unpowered tint based on saved shared building power flags.
- **Performance:** recomputes district/time profile at most once every four seconds, then interpolates the already-existing effects; no additional draw calls, lights, shadows, downloads, or audio playback.

## District look and feel

| Area | Visual tone |
|---|---|
| Ash Ring/outskirts | Light ash, clear distant roads |
| Hollow Blocks/residential | Warm dust over destroyed apartments |
| Exchange Market | Faded smoky storefront haze |
| St. Mercy/medical | Cold grey-green mist |
| Ironworks/Ashfall | Rust-brown industrial ash and stronger gust cues |
| Buried Line | Dimmer blue-green underground dust |
| Blackglass/research | Cool containment haze |

The client's site-distance selector uses authored landmark districts when within 15 world units, otherwise the existing server-confirmed district. The visual selection does **not** replace the server's difficulty/risk maps.

## QA acceptance

1. Travel between North Bus Depot, Exchange Market, St. Mercy, Ironworks, Ashfall and Research Annex: ensure each district gets a subtle but distinct profile, without hiding enemies.
2. Enter a building and verify outdoor ash fades away. Power the Ashfall station with two players and verify both get the lit-service-wing palette after the ordinary world/presence refresh.
3. On mobile, confirm movement, HUD and camera remain responsive with 150 ash particles; there should be no new render passes or draw calls from this feature.
4. If local clocks differ, cosmetic 90-second gust phase may vary between clients; it never changes gameplay state. Shared power remains server-owned.
5. The effects do **not** simulate radiation, infection, weather damage, improved loot, real-world health impacts, or guaranteed loot drops.
