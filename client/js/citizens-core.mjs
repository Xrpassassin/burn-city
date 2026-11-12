// Pure (DOM/three-free) helpers for the City citizens: life-script validation, daily schedules,
// named-place resolution and near-LOD slot selection. Tested in citizens-core.test.mjs.
export const SCHEMA = 'burn-city-citizen/1';
export const PLACE_KINDS = ['spawn', 'police', 'fire', 'ems', 'power', 'shop', 'tower'];
export const SHOP_IDS = ['mart', 'smoke', 'disp', 'coffee', 'arcade'];
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const minutesOf = t => { const m = HHMM.exec(t || ''); return m ? +m[1] * 60 + +m[2] : NaN; };

export function validateCitizen(c, modelIds = null) {
  const e = [];
  if (!c || typeof c !== 'object') return ['not an object'];
  if (c.schema !== SCHEMA) e.push(`schema must be "${SCHEMA}"`);
  if (!/^[a-z0-9-]{2,40}$/.test(c.id || '')) e.push('id: 2-40 chars, lowercase letters, digits, dashes');
  if (typeof c.name !== 'string' || !c.name.trim() || c.name.length > 40) e.push('name: 1-40 chars');
  if (typeof c.modelId !== 'string' || (modelIds && !modelIds.includes(c.modelId))) e.push('modelId: must be one of the City citizen models');
  if (c.personality != null && (typeof c.personality !== 'string' || c.personality.length > 400)) e.push('personality: string up to 400 chars');
  if (!Array.isArray(c.schedule) || !c.schedule.length || c.schedule.length > 24) e.push('schedule: 1-24 entries');
  else c.schedule.forEach((s, i) => {
    if (Number.isNaN(minutesOf(s && s.time))) e.push(`schedule[${i}].time: "HH:MM" 24h`);
    if (!placeOk(s && s.place)) e.push(`schedule[${i}].place: unknown place "${s && s.place}"`);
    if (s && s.activity != null && (typeof s.activity !== 'string' || s.activity.length > 80)) e.push(`schedule[${i}].activity: string up to 80 chars`);
    if (s && s.say != null && (typeof s.say !== 'string' || s.say.length > 140)) e.push(`schedule[${i}].say: string up to 140 chars`);
  });
  if (c.dialogue != null && (!Array.isArray(c.dialogue) || c.dialogue.length > 30 || c.dialogue.some(l => typeof l !== 'string' || !l.trim() || l.length > 140))) e.push('dialogue: up to 30 lines, each 1-140 chars');
  return e;
}

export function placeOk(p) {
  if (typeof p !== 'string') return false;
  const [k, arg] = p.split(':');
  if (!PLACE_KINDS.includes(k)) return false;
  if (k === 'shop') return SHOP_IDS.includes(arg);
  if (k === 'tower') return /^[A-Za-z0-9$._-]{1,20}$/.test(arg || '');
  return arg === undefined;
}

// Entry active at `minutes` (0..1439): the latest entry whose time <= now, wrapping to yesterday's last.
export function activeEntry(schedule, minutes) {
  const s = [...schedule].sort((a, b) => minutesOf(a.time) - minutesOf(b.time));
  let cur = s[s.length - 1];
  for (const e of s) if (minutesOf(e.time) <= minutes) cur = e;
  return cur;
}

// world: { spawn:{x,z}, police/fire/ems:{door:{x,z}}, power:{x,z}, shops:[{id,door,yaw}], towers:[{name,pos:{x,z}}], colliders:[{x,z,r}] }
// Returns a standing point {x,z} or null when the place does not exist in this City build.
export function resolvePlace(place, w) {
  if (!placeOk(place) || !w) return null;
  const [k, arg] = place.split(':');
  if (k === 'spawn') return w.spawn ? { x: w.spawn.x, z: w.spawn.z } : null;
  if (k === 'police' || k === 'fire' || k === 'ems') { const o = w[k]; return o && o.door ? { x: o.door.x, z: o.door.z } : null; }
  if (k === 'power') return w.power ? { x: w.power.x + 22, z: w.power.z + 22 } : null;
  if (k === 'shop') { const s = (w.shops || []).find(o => o.id === arg); return s ? { x: s.door.x - Math.sin(s.yaw) * 2.2, z: s.door.z - Math.cos(s.yaw) * 2.2 } : null; }
  if (k === 'tower') {
    const n = (w.towers || []).find(o => o.name && o.name.toUpperCase() === arg.toUpperCase() && o.pos); if (!n) return null;
    let r = 8; for (const c of w.colliders || []) if (c.r && Math.hypot(c.x - n.pos.x, c.z - n.pos.z) < 3) r = Math.max(r, c.r + 3);
    const sx = (w.spawn ? w.spawn.x : 0) - n.pos.x, sz = (w.spawn ? w.spawn.z : 0) - n.pos.z, d = Math.hypot(sx, sz) || 1;
    return { x: n.pos.x + sx / d * r, z: n.pos.z + sz / d * r };
  }
  return null;
}

// Pick up to k agents nearest to the camera inside radius; named citizens first. Returns array of agent indexes.
export function pickNear(agents, cx, cz, k, radius, visible = () => true) {
  const c = [];
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i]; if (a.hidden) continue;
    const d = Math.hypot(a.x - cx, a.z - cz); if (d > radius || !visible(a)) continue;
    c.push([d - (a.named ? 1e4 : 0), i]);
  }
  c.sort((a, b) => a[0] - b[0]);
  return c.slice(0, k).map(x => x[1]);
}

export const BUDGET = {   // near (rigged) slots / near radius m / far cull radius m, per City quality tier
  low: { near: 4, nearR: 14, farR: 180 }, medium: { near: 6, nearR: 18, farR: 260 }, high: { near: 16, nearR: 30, farR: 420 },
  phoneHigh: { near: 8, nearR: 20, farR: 300 }
};
export const budgetFor = (tier, mobile) => mobile && tier === 'high' ? BUDGET.phoneHigh : (BUDGET[tier] || BUDGET.medium);
