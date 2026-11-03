// RETIRED: the former automated 70/30 IMG/PLX + IMG/XRP production
// activation workflow must never unpause treasury, enable new sales or
// start liquidity transactions after the IMG/RLUSD-only migration.
//
// Preserve a clear failure instead of redirecting old commands to the new
// release controls; a new legally reviewed production process is required.
// To inspect the current (read-only) launch blockers use GitHub Actions
// "Estates IMG/RLUSD read-only production preflight".
// For emergency pause/status, the separate estate-live-ops.cjs still
// exposes those two modes without using the retired activation path.
throw new Error('legacy_70_30_pollux_activation_retired_use_img_rlusd_preflight');
