// Cosmetic catalog. Cosmetic ONLY: the simulation never reads these (same damage, fuel, speed for all).
const X = 1e6, env = process.env;
const items = {
  skin_ember:   { kind: 'skin',  name: 'Ember Runner',      drops: 1 * X, color: '#ff5a1f' },
  skin_chrome:  { kind: 'skin',  name: 'Chrome Vault',      drops: 2 * X, color: '#c8d4e0' },
  skin_ghost:   { kind: 'skin',  name: 'Ledger Ghost',      drops: 3 * X, color: '#7af0ff' },
  trail_gold:   { kind: 'trail', name: 'Gold Lock Trail',   drops: 2 * X, color: '#ffd24a' },
  trail_plasma: { kind: 'trail', name: 'Plasma Trail',      drops: 3 * X, color: '#c04bff' },
  flame_blue:   { kind: 'flame', name: 'Blue Inferno',      drops: 2 * X, color: '#3aa0ff', sound: 'roar' },
  flame_green:  { kind: 'flame', name: 'Toxic Burn',        drops: 3 * X, color: '#5aff4a', sound: 'hiss' },
  flame_burnxrp:{ kind: 'flame', name: 'BURN Signature',    drops: 5 * X, color: '#ff2a00', sound: 'crackle' },
  // FREE rewards (never sold): granted server-side, stored in `owned` with hash 'reward:*'
  skin_streak7:   { kind: 'skin',  name: 'Streak Flame (7-day)',  drops: 0, color: '#ff9a2a', reward: '7-day visit streak' },
  flame_streak30: { kind: 'flame', name: 'Eternal Flame (30-day)', drops: 0, color: '#ffd24a', sound: 'roar', reward: '30-day visit streak' },
  drone_burncoin: { kind: 'drone', name: 'BURN Coin Drone',       drops: 0, color: '#ffb000', reward: 'find all 5 weekly BURN coins' },
};
for (const [id, it] of Object.entries(items)) if (env['PRICE_' + id.toUpperCase()]) it.drops = +env['PRICE_' + id.toUpperCase()];
module.exports = { items };
