// Blacktide ports + cargo trade (client). Every number shown here comes from the server (/api/bt/*, server/blacktide.js):
// gold doubloons, prices, cargo and capacity are never decided in the browser. Doubloons are a Blacktide-only game currency.
import * as THREE from 'three';

const API = '/api/bt/';
const tok = () => { try { return localStorage.bcToken || ''; } catch (e) { return ''; } };
const call = async (op, body) => {
  const r = await fetch(API + op, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok() }, body: body ? JSON.stringify(body) : undefined });
  let d = {}; try { d = await r.json(); } catch (e) {}
  return { status: r.status, ...d };
};
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

let world = null, me = null, near = null, docked = null, busy = false, msg = null, signedIn = false;
const ui = {};

function buildUi() {
  ui.dock = el('button', 'bt-dock'); ui.dock.type = 'button'; ui.dock.hidden = true;
  ui.dock.addEventListener('click', () => near && open(near));
  ui.panel = el('section', 'bt-port'); ui.panel.hidden = true; ui.panel.setAttribute('aria-label', 'Port market');
  ui.title = el('h2'); ui.region = el('p', 'bt-region'); ui.purse = el('div', 'bt-purse');
  ui.table = el('div', 'bt-goods'); ui.note = el('p', 'bt-note');
  ui.up = el('button', 'bt-up'); ui.up.type = 'button'; ui.up.addEventListener('click', () => act('upgrade', { kind: 'hold' }));
  ui.close = el('button', 'bt-close', 'SET SAIL'); ui.close.type = 'button'; ui.close.addEventListener('click', close);
  ui.panel.append(ui.title, ui.region, ui.purse, ui.table, ui.up, ui.note, ui.close);
  document.getElementById('game').append(ui.dock, ui.panel);
  ui.regionRow = document.createElement('div'); ui.regionRow.className = 'hud-row';
  ui.regionRow.append(el('span', null, 'Waters'), ui.regionName = el('strong', null, '…'));
  ui.goldRow = document.createElement('div'); ui.goldRow.className = 'hud-row';
  ui.goldRow.append(el('span', null, 'Doubloons'), ui.goldVal = el('strong', null, '—'));
  const hud = document.querySelector('.hud'), hint = hud && hud.querySelector('.hint');
  if (hud) { hud.insertBefore(ui.regionRow, hint); hud.insertBefore(ui.goldRow, hint); }
  addEventListener('keydown', e => { if (e.key.toLowerCase() === 'e' && near && !docked) open(near); else if (e.key === 'Escape' && docked) close(); });
}

function beacon(scene, p) {   // one lantern post + light ring per port (2 draws each)
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(.25, .35, 9, 6), new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 1 }));
  post.position.y = 4.5; g.add(post);
  const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(.9), new THREE.MeshBasicMaterial({ color: 0xffb35c }));
  lamp.position.y = 9.6; g.add(lamp);
  const a = Math.atan2(-p.z, -p.x), off = Math.max(9, p.r - 14);     // on the seaward side of the island, facing the starting bay
  g.position.set(p.x + Math.cos(a) * off, 0, p.z + Math.sin(a) * off); scene.add(g);
}

async function refresh() {
  if (!tok()) { signedIn = false; return; }
  const d = await call('state'); if (d.status === 200) { me = d; signedIn = true; } else if (d.status === 401) signedIn = false;
}

function render() {
  ui.goldVal.textContent = me ? me.gold.toLocaleString() + ' g' : (signedIn ? '…' : 'sign in');
  if (!docked) return;
  const p = docked, pr = (me && me.prices && me.prices[p.id]) || world.prices[p.id], region = world.regions.find(r => r.id === p.region);
  ui.title.textContent = p.name;
  ui.region.textContent = (region ? region.name : '') + (region && !region.pvp ? ' · protected waters' : '');
  ui.purse.textContent = me ? `${me.gold.toLocaleString()} gold doubloons · hold ${me.used}/${me.cap}` : 'Prices only: sign in to trade';
  ui.table.replaceChildren();
  const head = el('div', 'bt-row bt-head'); head.append(el('span', null, 'Cargo'), el('span', null, 'Held'), el('span', null, 'Buy'), el('span', null, 'Sell'), el('span'), el('span'));
  ui.table.append(head);
  for (const g of world.goods) {
    const row = el('div', 'bt-row'); row.dataset.good = g.id;
    const held = me ? (me.hold[g.id] || 0) : 0;
    const b = el('button', 'bt-buy', 'BUY'), s = el('button', 'bt-sell', 'SELL'); b.type = s.type = 'button';
    b.disabled = !me || busy || me.gold < pr[g.id].buy || me.used >= me.cap; s.disabled = !me || busy || !held;
    b.addEventListener('click', () => act('buy', { port: p.id, good: g.id, qty: 1 }));
    s.addEventListener('click', () => act('sell', { port: p.id, good: g.id, qty: 1 }));
    row.append(el('span', null, g.name), el('span', 'bt-held', String(held)), el('span', null, pr[g.id].buy + 'g'), el('span', null, pr[g.id].sell + 'g'), b, s);
    ui.table.append(row);
  }
  const nh = me && me.nextHold;
  ui.up.hidden = !me; ui.up.disabled = !nh || busy || me.gold < nh.cost;
  ui.up.textContent = nh ? `UPGRADE HOLD +${nh.add} · ${nh.cost}g` : 'HOLD FULLY UPGRADED';
  ui.note.textContent = msg || (signedIn ? 'Buy low here, sell dear in another port. Progress saves to your captain.' : 'Sign in with XAMAN in BURN City (top bar) to trade. Gold doubloons are Blacktide-only.');
}

async function act(op, body) {
  if (busy) return; busy = true; msg = null; render();
  try {
    const d = await call(op, body);
    if (d.status === 200 && d.ok) { me = { ...me, ...d, prices: { ...(me && me.prices), ...(d.prices ? { [body.port]: d.prices } : {}) } }; msg = op === 'sell' ? `Sold for ${d.got} gold.` : op === 'buy' ? `Bought for ${d.cost} gold.` : `Hold upgraded to ${d.cap}.`; }
    else { if (d.gold != null) me = { ...me, ...d }; msg = ({ hold_full: 'Your hold is full.', not_enough_gold: 'Not enough doubloons.', not_enough_cargo: 'You have none of that aboard.', slow_down: 'Easy, captain: too many trades. Wait a moment.', sign_in_with_xaman: 'Sign in with XAMAN in BURN City to trade.', maxed: 'Hold is fully upgraded.' })[d.error] || 'The harbourmaster refused that trade.'; if (d.status === 401) signedIn = false; }
  } catch (e) { msg = 'No answer from the harbour. Check your connection.'; }
  busy = false; render();
}

function open(p) { docked = p; ui.dock.hidden = true; ui.panel.hidden = false; msg = null; render(); refresh().then(render); }
function close() { docked = null; ui.panel.hidden = true; msg = null; }

export async function init(scene) {
  buildUi();
  try { const r = await fetch(API + 'world'); world = await r.json(); } catch (e) { world = null; }
  if (!world || !world.ports) { ui.regionName.textContent = 'uncharted (offline)'; return; }
  for (const p of world.ports) beacon(scene, p);
  const start = world.regions.find(r => r.levelMin === 1) || world.regions[0];
  ui.regionName.textContent = start.name;
  await refresh(); render();
}
// Called every frame with the ship position. Returns true while docked (the helm is locked).
export function tick(pos) {
  if (!world || !world.ports) return false;
  if (docked) return true;
  let best = null, bd = 1e9;
  for (const p of world.ports) { const d = Math.hypot(pos.x - p.x, pos.z - p.z); if (d < p.r && d < bd) { bd = d; best = p; } }
  if (best !== near) { near = best; ui.dock.hidden = !near; if (near) ui.dock.textContent = `⚓ DOCK · ${near.name}`; }
  return false;
}
export function setShoreMode(ashore) { if (ui.panel && docked) ui.panel.hidden = !!ashore; }
export const test = { state: () => ({ near: near && near.id, docked: docked && docked.id, me, signedIn, world: !!world, busy, msg }), ports: () => world && world.ports, refresh };
