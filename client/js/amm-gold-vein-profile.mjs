// Visual-only, immutable AMM material profile. Gold means VERIFIED permanent
// lock of AMM LP token supply; not a currency's burned supply, custody escrow,
// or an estimated figure from a stale explorer.
// With a circular bar, cross-section area grows with locked fraction: radius
// grows as sqrt(verified share). A full lock leaves a visible activity-colour rim.
export function verifiedGoldFraction(share) {
 return typeof share==='number'&&Number.isFinite(share)&&share>=0&&share<=1?share:0;
}
export function goldCoreRadiusFraction(share) {
 return 0.88*Math.sqrt(verifiedGoldFraction(share));
}
const clamp01=x=>Math.min(1,Math.max(0,Number.isFinite(x)?x:0));
export function easeProfile(t) {
 const u=clamp01(t);return u*u*(3-2*u);
}
// The helix starts tangent-compatible with its bridge and gradually settles
// toward the tower facade, never crossing its reserved support radius.
export function towerHelixRadius(start,buildingSafeRadius,u) {
 if(!(start>0)||!(buildingSafeRadius>0))return 0;
 const lower=Math.min(start,Math.max(buildingSafeRadius+.12,start*.91));
 return start+(lower-start)*easeProfile((clamp01(u)-.18)/.82);
}
// Both activity shell and gold vein shrink together in the last part of the
// spiral; no hard shoulder at the join.
export function towerStreamTaper(u) { return 1-.66*easeProfile((clamp01(u)-.26)/.74); }
export function towerStreamOpacity(u) { return 1-easeProfile((clamp01(u)-.72)/.28); }
