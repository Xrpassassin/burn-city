// Eternal Grind v2 UI: desktop windowed HUD (draggable framed windows, paper-doll, bags, gems, hotbar, chat log, target/con, compass)
// and the phone layout (portrait + target frame, thumb buttons, quick bar, full-screen parchment panels with tap-to-move).
import * as S from './sys.js';
const $ = id => document.getElementById(id), h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DOLL_L = ['head', 'face', 'neck', 'shoulders', 'arms', 'wrist1', 'ring1'], DOLL_R = ['charm', 'back', 'chest', 'hands', 'wrist2', 'ring2', 'legs'], DOLL_B = ['primary', 'secondary', 'ranged', 'ammo', 'feet'];
const SIL = `<svg viewBox="0 0 120 260" class="sil"><defs><linearGradient id="silg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2c1e"/><stop offset="1" stop-color="#140e09"/></linearGradient></defs>
<path fill="url(#silg)" stroke="#a07a44" stroke-width="2" d="M60 8c11 0 18 8 18 19 0 8-4 14-9 17v6c10 2 22 6 27 12 5 7 8 30 10 52l2 30c0 4-6 5-8 1l-6-48-3 38v20l-4 50 2 38c0 6-14 6-14 0l-4-60h-4l-4 60c0 6-14 6-14 0l2-38-4-50v-20l-3-38-6 48c-2 4-8 3-8-1l2-30c2-22 5-45 10-52 5-6 17-10 27-12v-6c-5-3-9-9-9-17 0-11 7-19 18-19z"/>
<path d="M46 74h28M44 112h32M50 150h20" stroke="#a07a4455" stroke-width="2" fill="none"/></svg>`;
export function initUI(G) {
  const MOB = G.MOBILE; document.body.classList.add(MOB ? 'm' : 'd');
  const P = () => G.P;
  let wins = {}, zTop = 40, sel = null, selSpell = null, tipEl = $('tip'), ctxEl = null, logLines = [];
  const pos = (() => { try { return JSON.parse(localStorage.egUI || '{}'); } catch { return {}; } })(); const savePos = () => { try { localStorage.egUI = JSON.stringify(pos); } catch { } };
  // ---------- window manager (desktop) ----------
  function makeWin(id, title, { x, y, w, pausing, closable = true, cls = '' } = {}) { if (wins[id]) return wins[id];
    const el = h('div', 'win ' + cls); el.id = 'w_' + id; el.innerHTML = `<div class="wt"><span class="wtt">${esc(title)}</span>${closable ? '<button class="wx" title="Close">×</button>' : ''}</div><div class="wb"></div>`;
    if (w) el.style.width = w + 'px'; $('dui').appendChild(el); const p = pos[id] || [x, y]; place(el, p[0], p[1]);
    const W = { id, el, def: [x, y], body: el.querySelector('.wb'), pausing, open: true, setTitle: t => el.querySelector('.wtt').textContent = t };
    el.addEventListener('pointerdown', () => { el.style.zIndex = ++zTop; }, true);
    const bar = el.querySelector('.wt'); bar.addEventListener('pointerdown', e => { if (e.target.closest('.wx')) return; e.preventDefault(); const r = el.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top; bar.setPointerCapture(e.pointerId);
      const mv = ev => place(el, ev.clientX - ox, ev.clientY - oy), up = () => { bar.removeEventListener('pointermove', mv); bar.removeEventListener('pointerup', up); const r2 = el.getBoundingClientRect(); pos[id] = [Math.round(r2.left), Math.round(r2.top)]; savePos(); }; bar.addEventListener('pointermove', mv); bar.addEventListener('pointerup', up); });
    if (closable) el.querySelector('.wx').onclick = () => closeWin(id);
    el.style.zIndex = ++zTop; wins[id] = W; syncPause(); return W; }
  function place(el, x, y) { const r = el.getBoundingClientRect(), W = r.width || 200, H = r.height || 60; if (x < 0) x = innerWidth + x - W; if (y < 0) y = innerHeight + y - H; el.style.left = Math.max(0, Math.min(innerWidth - Math.min(W, 120), x)) + 'px'; el.style.top = Math.max(0, Math.min(innerHeight - 30, y)) + 'px'; }
  function closeWin(id) { const W = wins[id]; if (!W) return; W.el.remove(); delete wins[id]; hideTip(); if (id === 'inv') for (const k of Object.keys(wins)) if (k.startsWith('bag')) closeWin(k); syncPause(); }
  const anyPausing = () => Object.values(wins).some(w => w.pausing) || !!$('mpanel')?.classList.contains('on');
  function syncPause() { G.setUiPause(anyPausing()); }
  function relayout() { for (const W of Object.values(wins)) { if (pos[W.id]) { const r = W.el.getBoundingClientRect(); place(W.el, r.left, r.top); } else place(W.el, ...W.def); } }
  addEventListener('resize', () => { if (wins.target) wins.target.def[0] = innerWidth / 2 - 140; if (wins.hot) wins.hot.def[0] = Math.max(462, innerWidth / 2 - 255); relayout(); });
  // ---------- slots ----------
  function slotHtml(ref, label, big) { const it = S.getRef(P(), ref); const col = it ? S.RAR[it.r || 0][1] : '';
    return `<div class="slot${it ? ' has' : ''}${sel === ref ? ' sel' : ''}${big ? ' big' : ''}" data-ref="${ref}" ${it ? `style="--rc:${col}"` : ''}>${it ? S.iconHtml(it) : `<span class="lbl">${label || ''}</span>`}${it?.up ? `<span class="up">+${it.up}</span>` : ''}${it?.fx ? '<span class="fxd"></span>' : ''}${it?.t === 'bag' ? `<span class="cnt">${it.items.filter(Boolean).length}/${it.size}</span>` : ''}</div>`; }
  function dollHtml() { const L = k => slotHtml('eq:' + k, S.EQ_SLOTS[k][0]); return `<div class="doll"><div class="dcol">${DOLL_L.map(L).join('')}</div><div class="dmid">${SIL}<div class="dname">${esc(P().name)}</div></div><div class="dcol">${DOLL_R.map(L).join('')}</div><div class="drow">${DOLL_B.map(L).join('')}</div></div>`; }
  const genHtml = () => `<div class="gen">${Array.from({ length: 8 }, (_, i) => slotHtml('gen:' + i, '')).join('')}</div>`;
  const bagGridHtml = i => { const b = P().gen[i]; if (!b?.items) return ''; return `<div class="bgrid c${b.size <= 4 ? 2 : b.size <= 6 ? 3 : MOB ? 5 : 2}">${b.items.map((_, j) => slotHtml(`bag:${i}:${j}`, '')).join('')}</div>`; };
  function statsHtml() { const p = P(), s = p.st, d = S.DIFF[p.diff]; return `<div class="stats"><div class="sn">${esc(p.name)}</div><div>Level ${p.lvl} ${S.RACES[p.race][0]}</div><div class="scl">${S.clsLabel(p)}</div><hr>
    <div class="sr"><span>HP</span><b>${Math.ceil(p.hp)} / ${s.hp}</b></div><div class="sr"><span>MANA</span><b>${Math.floor(p.mp)} / ${s.mp}</b></div><div class="sr"><span>END</span><b>${Math.floor(G.player.st)} / 100</b></div><hr>
    <div class="sr"><span>AC</span><b>${s.def}</b></div><div class="sr"><span>ATK</span><b>${s.atk}</b></div><div class="sr"><span>CRIT</span><b>${s.crit}%</b></div><div class="sr"><span>HASTE</span><b>${s.spd - 100 >= 0 ? '+' : ''}${s.spd - 100}%</b></div><div class="sr"><span>WEIGHT</span><b>${s.wt}</b></div><hr>
    <div class="sr"><span>Gold</span><b>${p.gold}</b></div><div class="sr"><span>Ember Ore</span><b>${p.mats.ore}</b></div><div class="sr"><span>Ash Shards</span><b>${p.mats.shard}</b></div><div class="sr"><span>Run tier</span><b>${d[0]}</b></div><div class="sr"><span>Deepest</span><b>${p.best}</b></div></div>`; }
  // ---------- tooltips / context menu ----------
  function showTip(ref, x, y) { const it = S.getRef(P(), ref); if (!it) return hideTip(); tipEl.innerHTML = S.tooltipHtml(P(), it, ref); tipEl.style.display = 'block'; const r = tipEl.getBoundingClientRect(); tipEl.style.left = Math.min(innerWidth - r.width - 6, x + 16) + 'px'; tipEl.style.top = Math.min(innerHeight - r.height - 6, y + 12) + 'px'; }
  const hideTip = () => { tipEl.style.display = 'none'; };
  function ctxMenu(ref, x, y) { closeCtx(); const it = S.getRef(P(), ref); if (!it) return; ctxEl = h('div', 'ctx'); const acts = actionsFor(ref, it);
    ctxEl.innerHTML = `<div class="ctxh" style="color:${S.RAR[it.r || 0][1]}">${esc(S.itemName(it))}</div>` + acts.map((a, i) => `<button data-a="${i}">${a[0]}</button>`).join(''); document.body.appendChild(ctxEl);
    ctxEl.style.left = Math.min(innerWidth - 170, x) + 'px'; ctxEl.style.top = Math.min(innerHeight - 40 - acts.length * 34, y) + 'px'; ctxEl.onclick = e => { const b = e.target.closest('button'); if (!b) return; acts[+b.dataset.a][1](); closeCtx(); }; }
  const closeCtx = () => { ctxEl?.remove(); ctxEl = null; };
  addEventListener('pointerdown', e => { if (ctxEl && !e.target.closest('.ctx')) closeCtx(); }, true);
  function actionsFor(ref, it) { const a = [];
    if (it.t === 'bag') { const i = +ref.split(':')[1]; if (ref.startsWith('gen:')) a.push([isBagOpen(i) ? 'Close' : 'Open', () => toggleBag(i)]); }
    else if (ref.startsWith('eq:')) a.push(['Unequip', () => doEquip(ref)]); else a.push(['Equip', () => doEquip(ref)]);
    if (!ref.startsWith('eq:')) a.push([`Scrap (+${S.scrapValue(it).gold}g)`, () => doScrap(ref)]); return a; }
  // ---------- item actions (shared desktop + phone) ----------
  function changed() { G.changed(); refresh(); }
  function doEquip(ref) { const it = S.getRef(P(), ref); if (!it) return; if (it.t === 'bag') return; if (S.autoEquip(P(), ref)) { G.log('sys', ref.startsWith('eq:') ? `You remove the ${esc(S.itemName(it))}.` : `You equip the <span style="color:${S.RAR[it.r][1]}">${esc(S.itemName(it))}</span>.`); sel = null; changed(); } else G.log('sys', ref.startsWith('eq:') ? 'You have no room to put that.' : 'You cannot equip that.'); }
  function doScrap(ref) { const it = S.getRef(P(), ref); if (!it || ref.startsWith('eq:')) return; if (it.t === 'bag' && it.items.some(Boolean)) return G.log('sys', 'Empty the container first.');
    const v = S.scrapValue(it); S.removeRef(P(), ref); P().gold += v.gold; P().mats.ore += v.ore; P().mats.shard += v.shard; if (it.t === 'bag') closeBagWin(+ref.split(':')[1]);
    G.log('loot', `You scrap the ${esc(S.itemName(it))}: +${v.gold} gold, +${v.ore} ore${v.shard ? `, +${v.shard} shards` : ''}.`); sel = null; changed(); }
  function doMove(from, to) { const a = S.getRef(P(), from); if (S.moveItem(P(), from, to)) { if (a?.t === 'bag') { const fi = +from.split(':')[1], ti = +to.split(':')[1]; const fo = isBagOpen(fi); closeBagWin(fi); if (fo) toggleBag(ti); } changed(); return true; } return false; }
  // desktop drag & drop on slots
  let drag = null;
  document.addEventListener('pointerdown', e => { if (MOB) return; const s = e.target.closest('.slot[data-ref]'); if (!s || e.button !== 0) return; const ref = s.dataset.ref; if (!S.getRef(P(), ref)) return; e.preventDefault(); drag = { ref, x: e.clientX, y: e.clientY, on: false, src: s }; });
  document.addEventListener('pointermove', e => { if (MOB) return; if (drag) { if (!drag.on && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 5) { drag.on = true; hideTip(); const it = S.getRef(P(), drag.ref); drag.g = h('div', 'ghost', S.iconHtml(it)); document.body.appendChild(drag.g); drag.src.classList.add('dragging'); }
      if (drag.on) { drag.g.style.left = e.clientX - 22 + 'px'; drag.g.style.top = e.clientY - 22 + 'px'; document.querySelectorAll('.slot.drop').forEach(x => x.classList.remove('drop')); const t = document.elementFromPoint(e.clientX, e.clientY)?.closest('.slot[data-ref]'); if (t) t.classList.add(S.canPlace(P(), S.getRef(P(), drag.ref), t.dataset.ref) ? 'drop' : 'nodrop'); } return; }
    const s = e.target.closest?.('.slot[data-ref]'); if (s && S.getRef(P(), s.dataset.ref) && !ctxEl) showTip(s.dataset.ref, e.clientX, e.clientY); else if (!e.target.closest?.('.gem,.spl,.hk')) hideTip(); });
  document.addEventListener('pointerup', e => { if (MOB || !drag) return; const d = drag; drag = null; d.src.classList.remove('dragging'); document.querySelectorAll('.slot.drop,.slot.nodrop').forEach(x => x.classList.remove('drop', 'nodrop'));
    if (!d.on) { const it = S.getRef(P(), d.ref); if (it?.t === 'bag' && d.ref.startsWith('gen:')) toggleBag(+d.ref.split(':')[1]); return; }
    d.g.remove(); const t = document.elementFromPoint(e.clientX, e.clientY)?.closest('.slot[data-ref]');
    if (t) { if (!doMove(d.ref, t.dataset.ref)) G.log('sys', 'That does not fit there.'); } else if (e.target.closest?.('#forgeSlot')) forgePick(d.ref); });
  document.addEventListener('dblclick', e => { if (MOB) return; const s = e.target.closest('.slot[data-ref]'); if (s) doEquip(s.dataset.ref); });
  document.addEventListener('contextmenu', e => { const s = e.target.closest('.slot[data-ref]'); if (!s || MOB) return; e.preventDefault(); const it = S.getRef(P(), s.dataset.ref); if (!it) return; hideTip(); if (it.t === 'bag' && s.dataset.ref.startsWith('gen:')) toggleBag(+s.dataset.ref.split(':')[1]); else ctxMenu(s.dataset.ref, e.clientX, e.clientY); });
  // phone: tap-to-select / tap-to-move
  document.addEventListener('click', e => { if (!MOB) return; const s = e.target.closest('.slot[data-ref]'); if (!s) return; const ref = s.dataset.ref, it = S.getRef(P(), ref);
    if (forgeOpen() && $('mpanel').dataset.tab === 'forge' && it) { forgePick(ref); return; }
    if (sel && sel !== ref) { const okMove = doMove(sel, ref); if (okMove) { sel = null; refresh(); return; } if (!it) { G.log('sys', 'That does not fit there.'); return; } }
    sel = sel === ref ? null : (it ? ref : null); refresh(); });
  // ---------- bags (desktop windows) ----------
  const isBagOpen = i => !!wins['bag' + i];
  function toggleBag(i) { if (MOB) return; if (isBagOpen(i)) return closeWin('bag' + i); const b = P().gen[i]; if (!b?.items) return; const n = Object.keys(wins).filter(k => k.startsWith('bag')).length;
    const W = makeWin('bag' + i, b.n, { x: innerWidth - 150 - n * 140, y: innerHeight - 440, pausing: true, cls: 'bagw' }); W.body.innerHTML = bagGridHtml(i) + `<button class="done" data-close>Done</button>`; W.body.querySelector('[data-close]').onclick = () => closeWin('bag' + i); refresh(); }
  const closeBagWin = i => closeWin('bag' + i);
  // ---------- desktop: inventory window ----------
  function toggleInv() { if (MOB) return openPanel('char'); if (wins.inv) return closeWin('inv'); const W = makeWin('inv', 'Inventory', { x: Math.max(10, innerWidth / 2 - 300), y: 70, pausing: true, cls: 'invw' }); drawInv(); G.relock(false); }
  function drawInv() { const W = wins.inv; if (!W) return; W.body.innerHTML = `<div class="invg">${dollHtml()}${statsHtml()}</div><div class="invb"><div><div class="sub">General</div>${genHtml()}</div><div class="invbtn"><button data-a="bags">Open bags (B)</button><button data-a="book">Spells (K)</button>${G.nearForge() ? '<button data-a="forge">Forge</button>' : ''}<button data-a="done">Done</button></div></div><div class="hint">Drag items between slots · double-click to equip/unequip · right-click for options · drop a bag on a general slot to carry it</div>`;
    W.body.querySelector('.invbtn').onclick = e => { const a = e.target.closest('button')?.dataset.a; if (a === 'done') closeWin('inv'); if (a === 'bags') openAllBags(); if (a === 'book') toggleBook(); if (a === 'forge') openForge(); }; }
  function openAllBags() { const open = P().gen.some((b, i) => b?.items && isBagOpen(i)); P().gen.forEach((b, i) => { if (b?.items) { if (open && isBagOpen(i)) closeWin('bag' + i); else if (!open && !isBagOpen(i)) toggleBag(i); } }); }
  // ---------- spellbook ----------
  function bookHtml() { const k = S.knownSpells(P()); return `<div class="sub">Known spells and abilities · ${S.clsLabel(P())}</div><div class="book">${k.map(id => { const s = S.SPELLS[id]; return `<div class="spl${selSpell === id ? ' sel' : ''}" data-spell="${id}"><span class="sg" style="--c:${s.col}">${s.g}</span><div><b>${s.n}</b><div class="dim">${s.d}</div><div class="dim">${s.res === 'en' ? 'Endurance' : 'Mana'} ${s.cost} · Recast ${s.cd}s${s.cls !== '*' ? ' · ' + S.CLASSES[s.cls][4] : ''}</div></div></div>`; }).join('')}</div><div class="sub">Spell gems (tap a spell, then a gem)</div><div class="gemset">${P().gems.map((g, i) => gemHtml(i, true)).join('')}</div>`; }
  function bindBook(root) { root.querySelectorAll('[data-spell]').forEach(el => el.onclick = () => { selSpell = selSpell === el.dataset.spell ? null : el.dataset.spell; refresh(); });
    root.querySelectorAll('.gemset .gem').forEach(el => el.onclick = () => { const i = +el.dataset.gem; if (selSpell) { const j = P().gems.indexOf(selSpell); if (j >= 0) P().gems[j] = P().gems[i]; P().gems[i] = selSpell; G.log('sys', `You memorize ${S.SPELLS[selSpell].n} in gem ${i + 1}.`); selSpell = null; G.save(); refresh(); } }); }
  function toggleBook() { if (MOB) return openPanel('spells'); if (wins.book) return closeWin('book'); const W = makeWin('book', 'Spellbook', { x: 80, y: 90, w: 380, pausing: true }); drawBook(); }
  function drawBook() { const W = wins.book; if (!W) return; W.body.innerHTML = bookHtml(); bindBook(W.body); }
  // ---------- forge ----------
  let forgeRef = null; const forgeOpen = () => !!wins.forge || ($('mpanel')?.classList.contains('on') && $('mpanel').dataset.tab === 'forge');
  function forgePick(ref) { const it = S.getRef(P(), ref); if (!it || it.t === 'bag') return; forgeRef = ref; refresh(); }
  function forgeHtml() { const p = P(), it = forgeRef && S.getRef(p, forgeRef); let body = `<div class="forge"><div class="fl"><div id="forgeSlot" class="slot big${it ? ' has' : ''}" ${it ? `style="--rc:${S.RAR[it.r][1]}"` : ''}>${it ? S.iconHtml(it) + (it.up ? `<span class="up">+${it.up}</span>` : '') : '<span class="lbl">Place item</span>'}</div><div class="dim">${MOB ? 'Tap any item below' : 'Drag an item here, or click one in your inventory/bags while the forge is open'}</div></div><div class="fr">`;
    if (it) { const c = S.upCost(it); body += `<div class="tt-n" style="color:${S.RAR[it.r][1]}">${esc(S.itemName(it))}</div>`;
      body += (it.up || 0) >= 10 ? '<div>Fully forged (+10).</div>' : `<div>Next: <b>+${(it.up || 0) + 1}</b> (stats +8% each level)</div><div>Cost: ${c.ore} ore${c.shard ? `, ${c.shard} shards` : ''}, ${c.gold} gold</div><div>Success: <b>${Math.round(c.ch * 100)}%</b>${c.risk ? ' · <span class="bad">failure drops a level</span>' : ' · failure only costs materials'}</div><button data-f="up">Hammer it (+1)</button>`;
      const fx = it.fx && S.EFFECTS[it.fx]; body += `<hr><div>Effect: ${fx ? `<b>${fx.n}</b> <span class="dim">${fx.d}</span>` : '<span class="dim">none</span>'}</div>`;
      if (fx && !forgeRef.startsWith('eq:')) body += `<button data-f="study">Study effect (destroys item, learns ${fx.n})</button>`;
      const kind = S.fxKind(it.t), lib = p.codex.filter(e => S.EFFECTS[e].t === kind); body += `<div class="sub">Imbue from your codex (${S.IMBUE_COST.ore} ore, ${S.IMBUE_COST.shard} shard, ${S.IMBUE_COST.gold} gold)</div>` + (lib.length ? lib.map(e => `<button data-fx="${e}" class="fxb">${S.EFFECTS[e].n}</button>`).join('') : `<div class="dim">No ${kind} effects learned yet. Study items that carry one.</div>`); }
    else body += `<div class="dim">The Ember Forge improves gear from +1 to +10 with Ember Ore, Ash Shards and gold, and lets you swap proc and focus effects.</div>`;
    body += `<hr><div class="dim">You carry ${p.mats.ore} ore · ${p.mats.shard} shards · ${p.gold} gold</div></div></div>`; return body; }
  function bindForge(root) { root.querySelectorAll('[data-f],[data-fx]').forEach(b => b.onclick = () => { const p = P(), it = S.getRef(p, forgeRef); let r;
      if (b.dataset.f === 'up') r = S.tryUpgrade(p, it); else if (b.dataset.f === 'study') { r = S.study(p, forgeRef); if (r.ok) forgeRef = null; } else r = S.imbue(p, it, b.dataset.fx);
      G.log(r.ok ? 'loot' : 'bad', r.msg); G.sfx?.(r.ok ? 'up' : 'fail'); changed(); }); }
  function openForge() { if (MOB) return openPanel('forge'); if (wins.forge) return; if (!wins.inv) { toggleInv(); if (!pos.inv) place(wins.inv.el, Math.max(6, innerWidth - 470 - 572), 70); } const W = makeWin('forge', 'The Ember Forge', { x: innerWidth - 466, y: 70, w: 460, pausing: true }); drawForge(); G.relock(false); }
  function drawForge() { const W = wins.forge; if (!W) return; W.body.innerHTML = forgeHtml(); bindForge(W.body); }
  // clicking an item while the forge is open on desktop picks it (single click without drag)
  document.addEventListener('click', e => { if (MOB || !wins.forge) return; const s = e.target.closest('.slot[data-ref]'); if (s && S.getRef(P(), s.dataset.ref) && S.getRef(P(), s.dataset.ref).t !== 'bag') forgePick(s.dataset.ref); });
  // ---------- gems / hotbar ----------
  function gemHtml(i, plain) { const id = P().gems[i], s = id && S.SPELLS[id]; return `<div class="gem${s ? '' : ' empty'}" data-gem="${i}" ${s ? `style="--c:${s.col}"` : ''} title="${s ? esc(s.n) : 'Empty gem'}">${s ? `<span class="gg">${s.g}</span>` : ''}<i class="sw"></i>${plain ? '' : `<span class="gk">${i + 1}</span>`}</div>`; }
  function hotIcon(a) { if (!a) return ''; const [k, v] = a.split(':'); if (k === 'pot') return `<span class="pot p${v}">${v === '0' ? '❤' : '💧'}</span><span class="pc" data-pc="${v}"></span>`; if (k === 'gem') { const s = S.SPELLS[P().gems[+v]]; return s ? `<span class="gg" style="--c:${s.col}">${s.g}</span>` : ''; } return ''; }
  function drawBars() { const p = P(); if (!p) return;
    if (!MOB) { $('gems').innerHTML = p.gems.map((_, i) => gemHtml(i)).join(''); $('hot').innerHTML = p.hot.map((a, i) => `<div class="hk" data-hot="${i}">${hotIcon(a)}<i class="sw"></i><span class="kk">${(i + 1) % 10}</span></div>`).join(''); }
    else { $('mq').innerHTML = p.hot.slice(0, 6).map((a, i) => `<button class="mq" data-hot="${i}">${hotIcon(a)}<i class="sw"></i></button>`).join(''); const g0 = S.SPELLS[p.gems[0]]; $('mSp').innerHTML = g0 ? `<span class="gg">${g0.g}</span><i class="sw"></i>` : ''; }
    document.querySelectorAll('[data-gem]').forEach(el => { if (!el.closest('.gemset')) el.onclick = () => G.castGem(+el.dataset.gem); });
    document.querySelectorAll('[data-hot]').forEach(el => { const f = () => G.useHot(+el.dataset.hot); if (MOB) el.addEventListener('touchstart', ev => { ev.preventDefault(); ev.stopPropagation(); f(); }, { passive: false }); el.onclick = f; });
    document.querySelectorAll('.gem[data-gem],.hk[data-hot]').forEach(el => { el.onmouseenter = ev => { const i = el.dataset.gem != null ? +el.dataset.gem : null, a = i == null ? p.hot[+el.dataset.hot] : 'gem:' + i; let html = ''; if (a?.startsWith('gem:')) { const s = S.SPELLS[p.gems[+a.split(':')[1]]]; if (s) html = `<div class="tt-n" style="color:${s.col}">${s.n}</div><div>${s.d}</div><div class="dim">${s.res === 'en' ? 'Endurance' : 'Mana'} ${s.cost} · Recast ${s.cd}s</div>`; } else if (a?.startsWith('pot:')) html = a === 'pot:0' ? '<b>Healing Draught</b><div>Restores 50% health.</div>' : '<b>Mana Draught</b><div>Restores 60% mana.</div>'; if (html) { tipEl.innerHTML = html; tipEl.style.display = 'block'; const r = el.getBoundingClientRect(); tipEl.style.left = Math.min(innerWidth - 240, r.right + 8) + 'px'; tipEl.style.top = Math.max(4, r.top - 40) + 'px'; } }; el.onmouseleave = hideTip; }); }
  // ---------- chat / combat log ----------
  const LOGC = { hit: '#f2f2f2', crit: '#ffe24a', hurt: '#ff5a4a', miss: '#9a9a9a', spell: '#c49aff', heal: '#7f7', loot: '#ffd06a', xp: '#ffe9a0', sys: '#e0c890', bad: '#ff7a5a', con: '#bbb' };
  function log(type, html) { const p = h('div', 'll', html); p.style.color = LOGC[type] || '#ddd'; logLines.push({ type, html }); if (logLines.length > 250) logLines.shift();
    const box = $('chatBody'); if (box) { const atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 30; box.appendChild(p); while (box.children.length > 250) box.firstChild.remove(); if (atEnd) box.scrollTop = box.scrollHeight; }
    if (MOB) { const t = $('mlog'), q = p.cloneNode(true); t.appendChild(q); while (t.children.length > 4) t.firstChild.remove(); setTimeout(() => { q.style.opacity = 0; setTimeout(() => q.remove(), 800); }, 4500); if ($('mpanel').dataset.tab === 'log' && $('mpanel').classList.contains('on')) drawPanel(); } }
  // ---------- phone panels ----------
  const TABS = [['bag', '🎒', 'Bag'], ['char', '🛡', 'Character'], ['spells', '✦', 'Spells'], ['log', '📜', 'Journal'], ['map', '🗺', 'Map']];
  function openPanel(tab) { const m = $('mpanel'); if (m.classList.contains('on') && m.dataset.tab === tab) return closePanel(); m.dataset.tab = tab; m.classList.add('on'); sel = null; drawPanel(); syncPause(); }
  function closePanel() { $('mpanel').classList.remove('on'); $('mpanel').dataset.tab = ''; sel = null; forgeRef = null; syncPause(); }
  function drawPanel() { const m = $('mpanel'), tab = m.dataset.tab; if (!m.classList.contains('on')) return; const p = P();
    const tabs = (tab === 'forge' ? [['forge', '⚒', 'Forge'], ...TABS] : TABS).map(([k, ic, n]) => `<button class="mt${k === tab ? ' on' : ''}" data-tab="${k}"><span>${ic}</span>${n}</button>`).join('');
    let body = '';
    if (tab === 'bag') body = `<div class="sub">General slots</div>${genHtml()}` + p.gen.map((b, i) => b?.items ? `<div class="sub">${esc(b.n)} <span class="dim">(${b.items.filter(Boolean).length}/${b.size})</span></div>${bagGridHtml(i)}` : '').join('') + `<div class="dim mhint">Tap an item to select it, then tap another slot to move it there, or use the buttons below.</div>`;
    if (tab === 'char') body = `<div class="mchar">${dollHtml()}${statsHtml()}</div><div class="sub">General slots</div>${genHtml()}`;
    if (tab === 'spells') body = bookHtml();
    if (tab === 'log') body = `<div class="mjournal">${logLines.slice(-120).map(l => `<div class="ll" style="color:${LOGC[l.type] || '#ddd'}">${l.html}</div>`).join('')}</div>`;
    if (tab === 'map') body = `<canvas id="bigmap" width="600" height="600"></canvas><div class="dim">Floor ${p.depth} · ${G.themeName()} · ${G.foes()} foes left · purple: portal, orange: forge</div>`;
    if (tab === 'forge') body = forgeHtml() + `<div class="sub">Your items</div>${genHtml()}` + p.gen.map((b, i) => b?.items ? bagGridHtml(i) : '').join('') + `<div class="sub">Equipped</div><div class="gen">${Object.keys(S.EQ_SLOTS).map(k => slotHtml('eq:' + k, S.EQ_SLOTS[k][0])).join('')}</div>`;
    const it = sel && S.getRef(p, sel), card = it ? `<div class="mcard"><div class="mci">${S.iconHtml(it)}</div><div class="mct">${S.tooltipHtml(p, it, sel)}</div><div class="mcb">${it.t !== 'bag' ? `<button data-c="eq">${sel.startsWith('eq:') ? 'Unequip' : 'Equip'}</button>` : ''}${!sel.startsWith('eq:') ? '<button data-c="scrap">Scrap</button>' : ''}<button data-c="x">Cancel</button></div></div>` : '';
    m.innerHTML = `<div class="mph"><div class="mtabs">${tabs}</div><button class="mclose" aria-label="Close">✕</button></div><div class="mpb">${body}</div>${card}`;
    m.querySelector('.mclose').onclick = closePanel; m.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { m.dataset.tab = b.dataset.tab; sel = null; drawPanel(); });
    m.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { const c = b.dataset.c; if (c === 'eq') doEquip(sel); if (c === 'scrap') doScrap(sel); if (c === 'x') { sel = null; drawPanel(); } });
    if (tab === 'spells') bindBook(m); if (tab === 'forge') bindForge(m); if (tab === 'map') G.drawMap($('bigmap')); if (tab === 'log') { const j = m.querySelector('.mjournal'); j.scrollTop = j.scrollHeight; } }
  // ---------- per-frame HUD ----------
  let lastTgt = null;
  function frame(T) { const p = P(); if (!p?.st) return; const s = p.st, pl = G.player;
    const set = (id, v) => { const e = $(id); if (e) e.style.width = Math.max(0, Math.min(100, v)) + '%'; };
    set('hpB', p.hp / s.hp * 100); set('mpB', p.mp / s.mp * 100); set('stB', pl.st); set('xpB', p.xp / S.xpNeed(p) * 100);
    set('mhpB', p.hp / s.hp * 100); set('mmpB', p.mp / s.mp * 100); set('mstB', pl.st);
    const tx = (id, v) => { const e = $(id); if (e && e.textContent !== v) e.textContent = v; };
    tx('hpT', `${Math.ceil(Math.max(0, p.hp))}/${s.hp}`); tx('mpT', `${Math.floor(p.mp)}/${s.mp}`); tx('stT', `${Math.floor(pl.st)}`); tx('mlv', `${p.lvl}`);
    tx('pSit', pl.sit ? 'Sitting · resting' : ''); tx('mSitT', pl.sit ? 'Resting…' : '');
    // buffs
    const bk = Object.entries(G.buffs).map(([k, b]) => k + Math.ceil(b.t)).join(); if ($('buffs').dataset.k !== bk) { $('buffs').dataset.k = bk; $('buffs').innerHTML = Object.entries(G.buffs).map(([k, b]) => `<span class="bf" style="--c:${S.SPELLS[k]?.col || '#fff'}" title="${S.SPELLS[k]?.n || k}">${S.SPELLS[k]?.g || '•'}<i>${Math.ceil(b.t)}</i></span>`).join(''); }
    // target + con colour
    const t = G.target(); if (t !== lastTgt || t) { lastTgt = t; for (const pre of ['', 'm']) { const box = $(pre + 'tgt'); if (!box) continue; if (!t) { box.classList.add('none'); tx(pre + 'tgtN', MOB ? '' : 'No target'); tx(pre + 'tgtL', ''); tx(pre + 'tgtP', ''); box.style.removeProperty('--con'); box.dataset.con = ''; set(pre + 'tgtH', 0); continue; } box.classList.remove('none'); const c = S.conOf(p.lvl, t.lvl); $(pre + 'tgtN').style.color = c.col; box.style.setProperty('--con', c.col); box.dataset.con = c.key; tx(pre + 'tgtN', t.name); tx(pre + 'tgtL', `Lv ${t.lvl} · ${c.desc}${t.stun > 0 ? ' · stunned' : t.slow > 0 ? ' · slowed' : ''}`); set(pre + 'tgtH', t.hp / t.max * 100); tx(pre + 'tgtP', Math.max(0, Math.ceil(t.hp / t.max * 100)) + '%'); } }
    // cooldown sweeps
    document.querySelectorAll('[data-gem] .sw').forEach(sw => { const id = p.gems[+sw.parentNode.dataset.gem]; sw.style.setProperty('--p', G.cdFrac(id)); });
    document.querySelectorAll('[data-hot] .sw').forEach(sw => { const a = p.hot[+sw.parentNode.dataset.hot]; sw.style.setProperty('--p', a?.startsWith('gem:') ? G.cdFrac(p.gems[+a.split(':')[1]]) : 0); });
    const s0 = $('mSp')?.querySelector('.sw'); if (s0) s0.style.setProperty('--p', G.cdFrac(p.gems[0]));
    document.querySelectorAll('[data-pc]').forEach(e => { const v = '' + p.pots[+e.dataset.pc]; if (e.textContent !== v) e.textContent = v; });
    // compass
    const deg = ((-pl.yaw * 180 / Math.PI) % 360 + 360) % 360; const cs = $(MOB ? 'mcomp' : 'compass'); if (cs) cs.style.setProperty('--h', deg.toFixed(1));
    tx('cdeg', `${Math.round(deg)}°`); }
  // ---------- refresh everything that shows inventory ----------
  function refresh() { drawInv(); drawForge(); drawBook(); for (const k of Object.keys(wins)) if (k.startsWith('bag')) { const i = +k.slice(3), b = P().gen[i]; if (!b?.items) closeWin(k); else wins[k].body.querySelector('.bgrid').outerHTML = bagGridHtml(i); }
    drawBars(); drawPanel(); const p = P(); if (p) { const t = (id, v) => { const e = $(id); if (e) e.textContent = v; }; t('pName', p.name); t('pCls', `${p.lvl} ${S.RACES[p.race][0]} ${S.clsLabel(p)}`); t('mName', p.name); t('pDiff', S.DIFF[p.diff][0]); for (const id of ['pPort', 'mPort']) { const im = $(id); if (im && !im.src.endsWith(`/${p.race}.webp`)) im.src = `a/r/${p.race}.webp`; } } }
  // ---------- HUD windows (desktop) ----------
  function buildHud() { if (MOB) return; const d = $('dui');
    const mk = (id, title, x, y, html, cls) => { const W = makeWin(id, title, { x, y, closable: false, cls: 'hudw ' + (cls || '') }); W.body.innerHTML = html; return W; };
    mk('player', 'Player', 10, 10, `<div class="pw"><img id="pPort" alt=""><div class="pwi"><b id="pName"></b><div id="pCls" class="dim"></div><div class="bar hp"><i id="hpB"></i><span id="hpT"></span></div><div class="bar mp"><i id="mpB"></i><span id="mpT"></span></div><div class="bar en"><i id="stB"></i><span id="stT"></span></div><div class="bar xp"><i id="xpB"></i></div><div id="buffs"></div><div id="pSit" class="sit"></div></div></div>`, 'playerw');
    mk('target', 'Target', innerWidth / 2 - 140, 46, `<div id="tgt" class="none"><div class="tn"><b id="tgtN">No target</b><span id="tgtP"></span></div><div class="bar tg"><i id="tgtH"></i></div><div id="tgtL" class="dim"></div></div>`, 'targetw');
    const c = h('div', '', `<div id="compass"><div class="cstrip"></div><div class="cneedle"></div></div>`); c.id = 'compassw'; d.appendChild(c);
    mk('gems', 'Gems', 10, 200, `<div id="gems"></div>`, 'gemsw'); mk('hot', 'Hotbar', Math.max(462, innerWidth / 2 - 255), -10, `<div id="hot"></div>`, 'hotw');
    mk('chat', 'Main Chat', 10, -10, `<div id="chatBody"></div>`, 'chatw');
    mk('map', 'Map', -10, 10, `<canvas id="mm" width="150" height="150"></canvas><div id="minfo" class="dim"></div>`, 'mapw');
    mk('menu', 'Grind', -10, 230, `<div class="menu"><button data-m="inv" title="Inventory (I)">🎒<span>Inv</span></button><button data-m="book" title="Spellbook (K)">✦<span>Spells</span></button><button data-m="sit" title="Sit / meditate (Z)">🧘<span>Sit</span></button><button data-m="mus" id="tMus" title="Music (M)">🎵<span>Music</span></button><button data-m="pause" title="Options (Esc)">⚙<span>Menu</span></button></div><div class="dim tier">Tier: <b id="pDiff"></b></div>`, 'menuw');
    $('w_menu').querySelector('.menu').onclick = e => { const m = e.target.closest('button')?.dataset.m; if (m === 'inv') toggleInv(); if (m === 'book') toggleBook(); if (m === 'sit') G.sit(); if (m === 'pause') G.pause(); };
    syncPause(); }
  function buildMobile() { if (!MOB) return; const mb = h('button', '', '🎵'); mb.id = 'tMus'; mb.className = 'mmus'; $('mui').appendChild(mb); $('mmenu').onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.p === 'rest') G.sit(); else openPanel(b.dataset.p); }; }
  buildHud(); buildMobile();
  return { relayout, resetLayout() { for (const k in pos) delete pos[k]; savePos(); relayout(); }, log, refresh, frame, toggleInv, toggleBook, toggleBag, openAllBags, openForge, openPanel, closePanel, anyPausing, closeTop() { if (ctxEl) { closeCtx(); return true; } if (MOB && $('mpanel').classList.contains('on')) { closePanel(); return true; } const ids = Object.keys(wins).filter(k => wins[k].pausing); if (!ids.length) return false; const top = ids.sort((a, b) => (+wins[b].el.style.zIndex) - (+wins[a].el.style.zIndex))[0]; closeWin(top); return true; },
    closeAll() { for (const k of Object.keys(wins)) if (wins[k].pausing) closeWin(k); if (MOB) closePanel(); }, get sel() { return sel; }, wins, forgeOpen, setForgeItem: forgePick };
}
