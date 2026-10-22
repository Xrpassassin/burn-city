# CinderWilds route invalidation

This isolated helper detects when a route may have become stale because the caller's world or obstacle revision changed.

## Behavior

- If `validatedRevision` equals `currentRevision`, it returns `world-revision-unchanged` without sampling the world.
- If the revision changed, it revalidates the supplied X/Z path using the existing bounded `validateWorldRoute` utility.
- If the route is now blocked, outside the playable area, or validation cannot finish safely, it returns `shouldReplan: true` with a reason.
- If the route remains clear, it returns `route-revalidated` and advances the returned validated revision to the current revision.

## Integration boundaries

The caller owns revision generation and must increment/change it whenever relevant obstacle or playable-area data changes. A revision must represent the same authoritative world data used by `isBlocked` and `isOutsidePlayableArea`. Moving entities require an obstacle snapshot/revision policy; this helper cannot detect changes if the caller never updates the revision.

This module does not create revisions, enqueue requests, run path searches, move entities, or modify live gameplay. Validation samples points along the path and is not a guarantee about full creature collision volume, vertical terrain, or motion occurring after validation. Sampling is bounded by `maxSamples`; a sample-limit result fails closed and requests replanning rather than treating the route as clear.
