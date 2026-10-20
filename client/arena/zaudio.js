// Zombies sound director: decides who makes which noise, where, and when. Every voice is positional (sfx.play with pos), every
// zombie keeps its own timers so the horde never moans in unison, and samples are picked at random with a pitch spread.
// Heartbeat: intensity = max(low health, crowd pressure: 3+ zombies within 6 m on your floor); drives BPM, volume, the low-pass
// muffle on everything else, a screen pulse and (Android) a short vibration per beat.
export function createZombieAudio(sfx, { base, mobile = false } = {}) {
  const Z = new Map();   // zombie id -> { t: next vocal, st: next footstep, near: was close, atk: attack cooldown }
  const loops = new Map();   // player id -> { k, h } weapon bed
  let horde = null, shriekT = 12 + Math.random() * 20, breathT = 0, hb = 0, vig = null, lastVib = 0, ready = false, forced = null;
  const R = (a, b) => a + Math.random() * (b - a), P = (x, y, z) => [x, y, z];
  function ensure() { if (!ready) { ready = true; sfx.loadBank(base); } }
  const EYE = 1.6, Y = z => (z.y || 0) + (z.ty === 4 || z.ty === 5 || z.cr ? 0.5 : 1.5);
  function vig_() { if (vig) return vig; vig = document.createElement('div'); vig.id = 'hbVig'; vig.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2;opacity:0;background:radial-gradient(ellipse at 50% 50%,transparent 45%,rgba(120,0,0,.55) 100%);transition:opacity .08s'; document.body.appendChild(vig); return vig; }
  sfx.hb.onBeat = (i, at) => { const v = vig_(); setTimeout(() => { v.style.transition = 'opacity .06s'; v.style.opacity = Math.min(0.9, 0.25 + 0.65 * i); setTimeout(() => { v.style.transition = 'opacity .35s'; v.style.opacity = 0.12 * i; }, 110); }, Math.max(0, at * 1000));
    if (i > 0.45 && navigator.vibrate && mobile && /Android/i.test(navigator.userAgent) && performance.now() - lastVib > 300) { lastVib = performance.now(); try { navigator.vibrate(i > 0.8 ? [35, 90, 25] : 28); } catch { } } };
  const api = {
    get state() { return { hb, bpm: sfx.hb.bpm, cutoff: Math.round(sfx.hb.cutoff), bank: sfx.bank, loops: loops.size, forced }; },
    force(f) { forced = f; },   // debug: { hp: 0..1 } and/or { near: n } overrides
    start() { ensure(); },
    stop() { for (const l of loops.values()) l.h?.stop(); loops.clear(); horde?.stop(0.5); horde = null; Z.clear(); sfx.heartbeat(0); hb = 0; if (vig) vig.style.opacity = 0; },
    // per frame. me = { x, y, z, yaw, hp, max, alive, down }, zs = interpolated zombies, ps = players (others' firing for weapon beds)
    tick(dt, me, zs, ps, myId) { if (!ready) return; const mx = me ? me.x : 0, mz = me ? me.z : 0, my = me ? me.y || 0 : 0; if (me) sfx.listen(mx, my + EYE, mz, me.yaw);
      const seen = new Set(), list = []; for (const z of zs || []) { seen.add(z.id); let s = Z.get(z.id); if (!s) Z.set(z.id, s = { t: R(0.5, 5), st: R(0, 0.6), near: false, atk: 0, lx: z.x, lz: z.z }); const d = Math.hypot(z.x - mx, z.z - mz) + Math.abs((z.y || 0) - my) * 1.5; list.push([d, z, s]); }
      for (const id of Z.keys()) if (!seen.has(id)) Z.delete(id);
      list.sort((a, b) => a[0] - b[0]);
      // vocals: the nearest dozen get their own timers; type decides the voice
      for (let i = 0; i < list.length; i++) { const [d, z, s] = list[i], pos = P(z.x, Y(z), z.z), mv = Math.hypot(z.x - s.lx, z.z - s.lz) / Math.max(dt, 1e-3); s.lx = z.x; s.lz = z.z; s.atk -= dt;
        if (i < 12 && (s.t -= dt) <= 0) { const jug = z.ty === 3, crawl = z.ty === 4 || z.ty === 5 || z.cr;
          if (jug) { sfx.play('roar', { pos, v: 1.2, rate: 0.95, ref: 5, max: 70, roll: 0.9 }); s.t = R(6, 10); }
          else if (crawl && Math.random() < 0.7) { sfx.play('crawl', { pos, v: 0.9, rate: 1, vr: 0.12, ref: 1.6, max: 30 }); s.t = R(2.5, 5); }
          else if (z.ty === 1 && d > 14 && Math.random() < 0.35) { sfx.play('shriek', { pos, v: 0.75, vr: 0.1, ref: 6, max: 80, roll: 0.7 }); s.t = R(6, 12); }
          else { sfx.play('groan', { pos, v: 0.85, rate: z.ty === 2 ? 0.82 : 1, vr: 0.12, ref: 2.4, max: 45 }); s.t = R(3.5, 9) * (d > 20 ? 1.6 : 1); } }
        // shamble: footsteps / drag for the nearest few that are moving
        if (i < 5 && d < 14 && mv > 0.4 && !z.out && (s.st -= dt) <= 0) { const crawl = z.ty === 4 || z.ty === 5 || z.cr; s.st = crawl ? R(0.35, 0.6) : R(0.55, 0.9) / Math.min(1.8, Math.max(0.7, mv / 2.5));
          sfx.play(crawl ? 'crawl' : 'step', { pos: P(z.x, z.y || 0, z.z), v: crawl ? 0.35 : z.ty === 2 || z.ty === 3 ? 0.8 : 0.5, rate: z.ty === 3 ? 0.7 : 1, vr: 0.15, ref: 1.5, max: 18, roll: 1.4 }); }
        // lunge: first time one closes inside 2.4 m on your floor, it screams
        if (me && d < 2.4 && !s.near && s.atk <= 0) { s.near = true; s.atk = 3; sfx.play('attack', { pos, v: 1, vr: 0.1, ref: 1.5, max: 25 }); } else if (d > 4) s.near = false; }
      // close wet breathing from the nearest one inside 3.5 m
      breathT -= dt; if (list.length && list[0][0] < 3.5 && breathT <= 0) { const z = list[0][1]; breathT = R(1.8, 3); sfx.play('breath', { pos: P(z.x, Y(z), z.z), v: 0.9, vr: 0.1, ref: 1, max: 8, roll: 1.6 }); }
      // distant shrieks: somewhere far off, now and then
      if ((shriekT -= dt) <= 0) { shriekT = R(14, 36); const far = list.filter(o => o[0] > 18); if (far.length) { const z = far[Math.floor(Math.random() * far.length)][1]; sfx.play('shriek', { pos: P(z.x, Y(z), z.z), v: 0.7, ref: 8, max: 90, roll: 0.6 }); } }
      // horde bed: grows with the count
      const n = list.length; if (!horde && n >= 6 && sfx.has('horde')) horde = sfx.loop('horde', { v: 0.0001 }); if (horde) horde.set(Math.min(0.5, n / 40) * (n >= 6 ? 1 : 0));
      // weapon beds for continuous fire (flamethrower / Dragon's Breath / beam), mine and other players'
      const want = new Set(); for (const p of ps || []) { if (!p.alive || p.down || !p.firing) continue; const k = p.w === 4 ? 'beam_loop' : p.w === 0 || p.w === 1 ? 'flame_loop' : null; if (!k) continue;
        if (p.id !== myId && (Math.hypot(p.x - mx, p.z - mz) > 40 || loops.size >= 5)) continue; want.add(p.id); const pos = p.id === myId ? null : P(p.x, (p.y || 0) + 1.3, p.z); let l = loops.get(p.id);
        if (l && l.k !== k) { l.h?.stop(); loops.delete(p.id); l = null; }
        if (!l) { if (k === 'flame_loop') sfx.play('flame_start', { pos, v: p.id === myId ? 0.8 : 0.6, rate: p.w === 1 ? 0.85 : 1, vr: 0.05 }); l = { k, h: sfx.loop(k, { pos, v: p.id === myId ? (k === 'beam_loop' ? 0.45 : 0.7) : 0.45, rate: p.w === 1 ? 0.82 : 1 }) }; loops.set(p.id, l); }
        else l.h?.set(p.id === myId ? (k === 'beam_loop' ? 0.45 : 0.7) : 0.45, pos); }
      for (const [id, l] of loops) if (!want.has(id)) { l.h?.stop(0.15); if (l.k === 'flame_loop') { const p = (ps || []).find(o => o.id === id); sfx.play('flame_end', { pos: id === myId || !p ? null : P(p.x, (p.y || 0) + 1.3, p.z), v: 0.5 }); } loops.delete(id); }
      // heartbeat
      let hpF = me && me.alive ? me.hp / (me.max || 100) : 1, near = 0; for (const [d, z] of list) { if (d > 6) break; if (Math.abs((z.y || 0) - my) < 1.3 && !z.out) near++; }
      if (forced) { if (forced.hp != null) hpF = forced.hp; if (forced.near != null) near = forced.near; }
      const hpI = me && me.alive ? Math.max(0, Math.min(1, (0.5 - hpF) / 0.38)) : 0, crowdI = near >= 3 ? Math.min(1, 0.4 + 0.15 * (near - 3)) : 0, target = me && me.alive ? Math.max(hpI, crowdI, me.down ? 0.85 : 0) : 0;
      hb += (target - hb) * Math.min(1, dt * (target > hb ? 2.5 : 0.8)); sfx.heartbeat(hb); if (vig && hb < 0.03) vig.style.opacity = 0; },
    // one-off events
    shot(e, mine, shooterY = 0, myY = 0) { if (!ready) return; const pos = mine ? null : P(e.x, shooterY + 1.3, e.z);
      if (e.ls) { sfx.play('pistol', { pos, v: mine ? 0.9 : 0.6, rate: e.ls === 2 ? 0.85 : 1, vr: 0.06 }); return; }
      if (e.w === 'shotgun') { sfx.play('shotgun', { pos, v: mine ? 1 : 0.7, vr: 0.05, ref: 4, max: 70, roll: 0.8 }); sfx.play('pump', { pos, v: mine ? 0.7 : 0.4, at: 0.38, vr: 0.04 }); }
      else if (e.w === 'napalm') { sfx.play('firestorm', { pos, v: mine ? 0.95 : 0.65, vr: 0.06, ref: 4, max: 70, roll: 0.8 }); if (e.tx != null) sfx.play('boom', { pos: P(e.tx, (e.ty || 0) + 1, e.tz), v: 0.55, vr: 0.1, ref: 3, max: 60, at: 0.06 }); } },
    hit(e, tgt) { if (!ready) return; const pos = tgt ? P(tgt.x, Y(tgt), tgt.z) : null; if (e.hs) sfx.play('headshot', { pos, v: 0.8, vr: 0.06 }); else sfx.play('hit', { pos, v: e.k ? 0.85 : 0.55, vr: 0.12 }); },
    zdie(e, myY = 0) { if (!ready) return; const pos = P(e.x, (e.y || 0) + 1, e.z); sfx.play(Math.random() < 0.5 ? 'groan' : 'attack', { pos, v: 0.55, rate: 0.62, vr: 0.08, ref: 2, max: 30 }); },
    bitten(z) { if (!ready) return; const pos = z ? P(z.x, Y(z), z.z) : null; sfx.play('attack', { pos, v: 0.9, vr: 0.12, ref: 1.2, max: 20 }); sfx.play('bite', { v: 0.8, vr: 0.1 }); },
    roar(z) { if (!ready) return; sfx.play('roar', { pos: z ? P(z.x, Y(z), z.z) : null, v: 1.3, rate: 0.9, ref: 5, max: 80, roll: 0.8 }); },
    reload(kind = 'reload') { if (!ready) return; sfx.play(kind, { v: 0.75, vr: 0.04 }); },
  };
  return api;
}
