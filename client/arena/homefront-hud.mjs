// Homefront RPG UI shell: a minimal HUD strip (health, ammo, quick slots, party minimap, menu) and
// on-demand full panels (Character, Inventory, Journal, Build, Manage, Travel) as one overlay with tabs.
// Everything else stays hidden by default so the 3D view is not congested (iPhone first).
// Presentation only: all numbers come from the server (world snapshot, /api/homefront/world/rpg).
export const HUD_TABS = Object.freeze(['character', 'inventory', 'journal', 'build', 'manage', 'travel']);
export const QUICK_SLOTS = Object.freeze([
  { id: 'bandage', icon: '🩹', label: 'Bandage', button: 'bandageInField' },
  { id: 'eat', icon: '🥫', label: 'Eat', button: 'eatInField' },
  { id: 'drink', icon: '💧', label: 'Drink', button: 'drinkInField' }
]);
// Panels that the Manage tab pages through one at a time (everything except the 3D views, field survival and build).
export const NOT_MANAGED = Object.freeze(['refugeWorldPanel', 'graveyardPanel', 'survivalPanel', 'buildPanel']);
// Pure: minimap points (self + party only) projected into a size×size canvas around the viewer.
export function minimapPoints(world, size = 64, span = 120) {
  const self = world?.self; if (!self) return [];
  const half = span / 2, k = size / span, out = [{ kind: 'self', x: size / 2, y: size / 2 }];
  for (const p of world.players || []) {
    if (p.label === 'You' || !p.party) continue;          // strangers never appear on the map
    const dx = Math.max(-half, Math.min(half, p.x - self.x)), dz = Math.max(-half, Math.min(half, p.z - self.z));
    out.push({ kind: 'party', x: size / 2 + dx * k, y: size / 2 + dz * k, id: p.id });
  }
  return out;
}
const CSS = `
body.rpg-hud header{padding:calc(6px + env(safe-area-inset-top)) 12px 6px}body.rpg-hud header .eyebrow{display:none}body.rpg-hud header h1{font-size:18px}body.rpg-hud header .btn{min-height:36px;padding:6px 10px;font-size:13px}
body.rpg-hud .wrap{padding:8px 8px 40px}body.rpg-hud #introText{display:none}body.rpg-hud #status{margin:6px 0;padding:6px 10px;font-size:12px}
body.rpg-hud .rpg-nav{display:none}body.rpg-hud .rpg-nav.hf-talk{display:flex;padding:6px;margin:6px 0}body.rpg-hud .rpg-nav.hf-talk>*:not(#rpgTalk){display:none!important}
.hf-hud{display:flex;align-items:center;gap:6px;flex-wrap:nowrap;padding:6px 8px;margin:0 0 8px;border:1px solid #a55c3566;border-radius:12px;background:#100b09ee;position:sticky;top:calc(52px + env(safe-area-inset-top));z-index:4}
.hf-hud .hf-vit{flex:1 1 auto;min-width:0;display:grid;gap:3px}.hf-bar{height:8px;border-radius:5px;background:#2b1c15;overflow:hidden}.hf-bar i{display:block;height:100%;background:linear-gradient(90deg,#c43a2a,#ff8b3d)}
.hf-hud small{font:700 11px system-ui;color:#e8cdb6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hf-q{width:38px;height:38px;flex:0 0 38px;border-radius:10px;border:1px solid #8e5235;background:#24140d;color:#ffe0c4;font-size:17px;padding:0;cursor:pointer}.hf-q:disabled{opacity:.35}
.hf-mm{width:44px;height:44px;flex:0 0 44px;border-radius:50%;border:1px solid #805238;background:#0c0a09}
.hf-menu{flex:0 0 auto;min-height:38px;padding:6px 10px;border-radius:10px;border:1px solid #ff8b3d;background:linear-gradient(120deg,#a63f16,#63250f);color:#ffe0c4;font:800 13px system-ui;cursor:pointer}
.hf-sheet{position:fixed;inset:0;z-index:40;background:#050403e6;display:grid;place-items:center;padding:calc(10px + env(safe-area-inset-top)) 10px calc(10px + env(safe-area-inset-bottom))}.hf-sheet[hidden]{display:none}
.hf-card{width:min(100%,640px);max-height:100%;display:flex;flex-direction:column;background:linear-gradient(155deg,#2a1a12,#100b09);border:1px solid #ff8b3d99;border-radius:16px;overflow:hidden}
.hf-tabs{display:flex;gap:4px;overflow-x:auto;padding:8px;border-bottom:1px solid #a55c3555;flex:0 0 auto}.hf-tabs button{flex:0 0 auto;min-height:36px;padding:6px 10px;border-radius:9px;border:1px solid #8e5235;background:#24140d;color:#ffe0c4;font:700 13px system-ui}.hf-tabs button[aria-selected=true]{background:#a63f16;border-color:#ffd09b}
.hf-body{padding:12px;overflow:auto;flex:1 1 auto;color:#f5e6d8;font-size:14px}.hf-body h3{margin:10px 0 6px;color:#ffc18e;font-size:15px}.hf-body .hf-row{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:7px 9px;margin:4px 0;border:1px solid #a55c3540;border-radius:9px;background:#0d0a09}.hf-body .hf-row button{min-height:34px;padding:4px 10px;border-radius:8px;border:1px solid #8e5235;background:#32190f;color:#ffe0c4;font:700 12px system-ui}
.hf-body .hf-muted{color:#bca99b;font-size:12px}.hf-close{margin:8px;align-self:flex-end;min-height:38px;padding:6px 14px;border-radius:10px;border:1px solid #8e5235;background:#24140d;color:#ffe0c4;font:700 13px system-ui}
body.rpg-hud.rpg-mode-home #refugeWorldPanel>h2,body.rpg-hud.rpg-mode-home #placementHelp,body.rpg-hud.rpg-mode-home #refugeWorldPanel .row{display:none}
body.rpg-hud #refugeWorldPanel,body.rpg-hud #graveyardPanel{padding:8px}
body.rpg-hud.rpg-mode-home #refugeWorldPanel .world{height:calc(100svh - 190px);min-height:300px}
body.rpg-hud.rpg-mode-expedition #graveyardPanel>h2,body.rpg-hud.rpg-mode-expedition #graveyardPanel>p.muted,body.rpg-hud.rpg-mode-expedition #graveyardPanel>p.worldhint,body.rpg-hud.rpg-mode-expedition #graveyardMap,body.rpg-hud.rpg-mode-expedition #graveyard3dStatus,body.rpg-hud.rpg-mode-expedition #explorationJournal,body.rpg-hud.rpg-mode-expedition #graveyardPanel>.row:last-of-type,body.rpg-hud.rpg-mode-expedition #partyStatus,body.rpg-hud.rpg-mode-expedition #game #survivalPanel{display:none!important}
body.rpg-hud.rpg-mode-expedition #graveyard3d{height:calc(100svh - 240px);min-height:280px}
body.rpg-hud.rpg-mode-expedition #graveyardPanel .row .btn{min-height:38px;padding:6px 9px;font-size:12px;flex:0 1 auto}body.rpg-hud.rpg-mode-expedition #graveyardPanel .row .btn:disabled,body.rpg-hud #aimStability,body.rpg-hud #ammoStatus{display:none}
body.rpg-hud.rpg-mode-expedition #explorationObjective,body.rpg-hud.rpg-mode-expedition #combatStatus,body.rpg-hud.rpg-mode-expedition #lootStatus{font-size:12px}
body.rpg-hud #game section.panel.hf-tab-off{display:none!important}body.rpg-hud.rpg-mode-management #refugeWorldPanel,body.rpg-hud.rpg-mode-management #graveyardPanel,body.rpg-hud.rpg-mode-management #game #survivalPanel{display:none!important}
.hf-mtabs[hidden]{display:none}.hf-mtabs{display:flex;gap:4px;overflow-x:auto;margin:0 0 8px;padding:2px}.hf-mtabs button{flex:0 0 auto;min-height:36px;padding:6px 10px;border-radius:9px;border:1px solid #8e5235;background:#24140d;color:#ffe0c4;font:700 12px system-ui;white-space:nowrap}.hf-mtabs button[aria-selected=true]{background:#a63f16}
.hf-sheet #survivalPanel{display:block!important;margin:0;padding:8px}
`;
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); for (const k of kids) n.append(k); return n; };

export function createHud({ request, getWorld, getBase, getMode, setMode, travel, message, signedIn, jetpack = null }) {
  if (typeof document === 'undefined') return null;
  document.head.append(el('style', { textContent: CSS }));
  document.body.classList.add('rpg-hud');
  const game = document.getElementById('game');
  const nav = game?.querySelector('.rpg-nav');
  const hp = el('i'), hpBar = el('div', { className: 'hf-bar' }, hp), hpText = el('small', { textContent: '❤ 100' }), ammoText = el('small', { textContent: '' });
  const vit = el('div', { className: 'hf-vit' }, hpBar, el('div', { style: 'display:flex;gap:8px;justify-content:space-between' }, hpText, ammoText));
  const quick = QUICK_SLOTS.map(q => { const b = el('button', { className: 'hf-q', type: 'button', textContent: q.icon, title: q.label }); b.setAttribute('aria-label', q.label); b.onclick = () => document.getElementById(q.button)?.click(); return b; });
  const mm = el('canvas', { className: 'hf-mm', width: 88, height: 88, title: 'Party map (only your party appears)' }); mm.setAttribute('aria-label', 'Party minimap');
  const menu = el('button', { className: 'hf-menu', type: 'button', textContent: '☰ Menu' }); menu.setAttribute('aria-haspopup', 'dialog');
  const hud = el('div', { className: 'hf-hud', id: 'hfHud' }, vit, ...quick, mm, menu); hud.setAttribute('role', 'toolbar'); hud.setAttribute('aria-label', 'HUD');
  nav?.after(hud);
  // Overlay with tabs (hidden by default).
  const tabsEl = el('div', { className: 'hf-tabs' }); tabsEl.setAttribute('role', 'tablist');
  const body = el('div', { className: 'hf-body' });
  const close = el('button', { className: 'hf-close', type: 'button', textContent: 'Close' });
  const card = el('div', { className: 'hf-card' }, tabsEl, body, close);
  const sheet = el('div', { className: 'hf-sheet', id: 'hfSheet', hidden: true }, card); sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', 'Character and management');
  document.body.append(sheet);
  const LABEL = { character: '🧍 Character', inventory: '🎒 Inventory', journal: '📓 Journal', build: '🛠 Build', manage: '📋 Manage', travel: '🧭 Travel' };
  let tab = 'character', rpg = null, borrowed = null;
  const returnBorrowed = () => { if (borrowed) { borrowed.home.after(borrowed.node); borrowed.home.remove(); borrowed = null; } };
  const hide = () => { returnBorrowed(); sheet.hidden = true; };
  close.onclick = hide; sheet.addEventListener('click', e => { if (e.target === sheet) hide(); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) hide(); if ((e.key === 'i' || e.key === 'I') && !/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName || '')) open(sheet.hidden ? 'inventory' : tab); });
  const rowOf = (left, right) => el('div', { className: 'hf-row' }, left, right || '');
  async function rpgAct(payload) { try { rpg = (await request('/api/homefront/world/rpg', 'POST', payload)).sheet; draw(); } catch (e) { message(e.message === 'no_skill_points' ? 'No skill points yet: earn XP in the Wastes.' : e.message, 'danger'); } }
  function draw() {
    returnBorrowed();
    tabsEl.replaceChildren(...HUD_TABS.map(t => { const b = el('button', { type: 'button', textContent: LABEL[t] }); b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(t === tab)); b.onclick = () => open(t); return b; }));
    body.replaceChildren();
    if (!rpg && ['character', 'inventory', 'journal'].includes(tab)) { body.append(el('p', { className: 'hf-muted', textContent: signedIn() ? 'Loading your character…' : 'Sign in to keep a character sheet.' })); return; }
    if (tab === 'character') {
      body.append(el('h3', { textContent: 'Level ' + rpg.level + (rpg.xpNextLevel ? ' · ' + rpg.xpThisLevel + '/' + rpg.xpNextLevel + ' XP' : ' · max level') }));
      body.append(el('p', { className: 'hf-muted', textContent: rpg.skillPoints + ' skill point' + (rpg.skillPoints === 1 ? '' : 's') + ' to spend · armor ' + rpg.armor + ' · XP comes from infected, crates, landmarks, rescues, workdays, sieges and PvP.' }));
      for (const s of rpg.skills) { const b = el('button', { type: 'button', textContent: s.rank >= s.max ? 'Max' : '+1' }); b.disabled = s.rank >= s.max || rpg.skillPoints < 1; b.onclick = () => rpgAct({ action: 'learn', skill: s.id }); body.append(rowOf(el('span', { textContent: s.label + ' ' + s.rank + '/' + s.max + ' · ' }, el('span', { className: 'hf-muted', textContent: s.planned + ' (bonus not active yet)' })), b)); }
    } else if (tab === 'inventory') {
      body.append(el('h3', { textContent: 'Equipment' }));
      body.append(rowOf(el('span', { textContent: '🔫 Weapon · ' + String(rpg.equipment.weapon).replaceAll('_', ' ') }), el('span', { className: 'hf-muted', textContent: 'change at the weapon bench' })));
      for (const slot of rpg.slots) { const id = rpg.equipment[slot], item = rpg.items.find(i => i.id === id); const b = el('button', { type: 'button', textContent: 'Unequip' }); b.hidden = !id; b.onclick = () => rpgAct({ action: 'unequip', slot }); body.append(rowOf(el('span', { textContent: slot[0].toUpperCase() + slot.slice(1) + ' · ' + (item ? item.label : 'empty') }), b)); }
      body.append(el('h3', { textContent: 'Gear' }));
      for (const i of rpg.items) { const b = el('button', { type: 'button', textContent: i.equipped ? 'Equipped' : 'Equip' }); b.disabled = i.equipped; b.onclick = () => rpgAct({ action: 'equip', item: i.id }); body.append(rowOf(el('span', { textContent: i.label + ' · ' + i.slot + (i.armor ? ' · armor ' + i.armor : '') }), b)); }
      const js = jetpack?.status?.();
      if (js) {   // Homefront jetpack: owned → how to fly; else a server-priced purchase (only when payments are on)
        if (js.owned?.homefront) body.append(rowOf(el('span', { textContent: '🚀 Homefront jetpack · fly in your yard' }), el('span', { className: 'hf-muted', textContent: 'J or JET · hold Space/JUMP' })));
        else if (js.payments) { const b = el('button', { type: 'button', textContent: 'Buy · ' + js.prices.homefront.xrp + ' XRP' }); b.onclick = async () => { hide(); if (await jetpack.buy()) open('inventory'); }; body.append(rowOf(el('span', { textContent: '🚀 Homefront jetpack · flight with fuel' }), b)); }
      }
      const field = document.getElementById('survivalPanel');
      if (field && getWorld()?.self) { body.append(el('h3', { textContent: 'Field pack' })); const ph = el('span'); field.before(ph); borrowed = { node: field, home: ph }; body.append(field); }
    } else if (tab === 'journal') {
      for (const q of rpg.quests) { const b = el('button', { type: 'button', textContent: q.done ? 'Done' : q.tracked ? 'Tracking' : 'Track' }); b.disabled = q.done || q.tracked; b.onclick = () => rpgAct({ action: 'track', quest: q.id }); body.append(rowOf(el('span', { textContent: (q.done ? '✅ ' : '◻ ') + q.label + ' · ' + q.progress + '/' + q.goal + ' ' }, el('span', { className: 'hf-muted', textContent: q.text + ' (+' + q.xp + ' XP)' })), b)); }
      if (rpg.log.length) { body.append(el('h3', { textContent: 'Recent' })); for (const e of rpg.log.slice().reverse()) body.append(el('p', { className: 'hf-muted', textContent: e.text })); }
    }
  }
  async function open(t = 'character') {
    if (t === 'build') { hide(); setMode('workshop'); return; }
    if (t === 'manage') { hide(); setMode('management'); return; }
    if (t === 'travel') { hide(); travel.open(); return; }
    tab = t; sheet.hidden = false; draw();
    if (signedIn()) { try { rpg = (await request('/api/homefront/world/rpg')).sheet; } catch { /* keep last */ } if (!sheet.hidden && tab === t) draw(); }
  }
  menu.onclick = () => open(tab === 'build' || tab === 'manage' || tab === 'travel' ? 'character' : tab);
  // Manage: one management panel at a time behind a tab strip.
  const mtabs = el('div', { className: 'hf-mtabs', hidden: true }); mtabs.setAttribute('role', 'tablist');
  hud.after(mtabs);
  let mSel = 0;
  function layoutManagement() {
    const mode = getMode(), managing = mode === 'management';
    mtabs.hidden = !managing;
    // The Workshop/build panel belongs to build mode only (Build tab → workshop); never in home, world or manage.
    document.getElementById('buildPanel')?.classList.toggle('hf-tab-off', mode !== 'workshop');
    // Top-level panels (some sit after the grid in the markup), minus the 3D views / field survival / build.
    const panels = [...(game?.querySelectorAll('section.panel') || [])].filter(p => !NOT_MANAGED.includes(p.id) && !p.parentElement.closest('section.panel'));
    // Outside Manage every management panel stays hidden: the HUD shell shows one view at a time.
    if (!managing) { for (const p of panels) p.classList.add('hf-tab-off'); return; }
    mSel = Math.min(mSel, panels.length - 1);
    if (mtabs.childElementCount !== panels.length + 1) {
      mtabs.replaceChildren(...panels.map((p, i) => { const b = el('button', { type: 'button', textContent: (p.querySelector('h2')?.textContent || 'Panel').slice(0, 26) }); b.onclick = () => { mSel = i; layoutManagement(); }; return b; }), Object.assign(el('button', { type: 'button', textContent: '↩ Homefront' }), { onclick: () => setMode('home') }));
    }
    [...mtabs.children].forEach((b, i) => b.setAttribute('aria-selected', String(i === mSel)));
    panels.forEach((p, i) => p.classList.toggle('hf-tab-off', i !== mSel));
  }
  const ctx = mm.getContext('2d');
  function update() {
    const world = getWorld(), inWorld = !!world?.self;
    const health = inWorld ? Math.round(world.selfSurvival?.health ?? 100) : 100;
    hp.style.width = Math.max(0, Math.min(100, health)) + '%'; hpText.textContent = '❤ ' + health + (inWorld ? '' : ' · Homefront');
    const mag = world?.selfWeaponMagazine;
    ammoText.textContent = inWorld ? (mag?.capacity > 0 ? '🔫 ' + mag.loaded + '/' + mag.capacity + ' · ' + (world.selfInventory?.ammo ?? 0) : '🗡 melee') : (getBase()?.level ? 'Refuge L' + getBase().level : '');
    for (const b of quick) b.hidden = !inWorld;
    QUICK_SLOTS.forEach((q, i) => { const src = document.getElementById(q.button); quick[i].disabled = !src || src.disabled; });
    if (nav) nav.classList.toggle('hf-talk', !!document.getElementById('rpgTalk') && !document.getElementById('rpgTalk').hidden);
    if (ctx) {
      ctx.clearRect(0, 0, 88, 88); ctx.fillStyle = '#16110e'; ctx.beginPath(); ctx.arc(44, 44, 43, 0, Math.PI * 2); ctx.fill();
      if (inWorld) for (const p of minimapPoints(world, 88)) { ctx.beginPath(); ctx.arc(p.x, p.y, p.kind === 'self' ? 5 : 4, 0, Math.PI * 2); ctx.fillStyle = p.kind === 'self' ? '#ffe28a' : '#8fd4f4'; ctx.fill(); }
      else { ctx.fillStyle = '#ffb06e'; ctx.font = '700 22px system-ui'; ctx.textAlign = 'center'; ctx.fillText('🏚', 44, 52); }
    }
    layoutManagement();
  }
  setInterval(update, 700); update();
  return { open, update, hide, element: hud, sheet };
}
