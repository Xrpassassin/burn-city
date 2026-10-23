// Arena audio. Two layers on one WebAudio graph:
//  1. the original tiny synthesized cues (UI, doors, box, perks), no files;
//  2. CC0 sample bank for Zombies (client/arena/sfx/*.mp3, sources in sfx/LICENSES.md): positional 3D voices (PannerNode, inverse
//     distance falloff), random variant + pitch per play so nothing repeats, voice cap, looping weapon beds, heartbeat, music bus.
// Graph: voices -> bus -> muffle (low-pass, closes as the heartbeat intensifies) -> master (volume / mute, persisted) -> limiter -> out.
// Master volume default 30%, persisted; created on the first gesture (Safari / iOS unlock).
let A = null, master = null, comp = null, noiseBuf = null, bus = null, muffle = null, hbBus = null, musicBus = null;
const LS = 'bcVol', MUTE = 'bcMute';
let vol = Math.min(1, Math.max(0, +(localStorage[LS] ?? 0.3))), muted = localStorage[MUTE] === '1';
const coarse = typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches;
function ctx() {
  try { if (!A) { A = new (window.AudioContext || window.webkitAudioContext)(); comp = A.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 6;
      master = A.createGain(); master.gain.value = muted ? 0 : vol; master.connect(comp).connect(A.destination);
      muffle = A.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 20000; muffle.Q.value = 0.7; muffle.connect(master);
      bus = A.createGain(); bus.connect(muffle); hbBus = A.createGain(); hbBus.connect(master); musicBus = A.createGain(); musicBus.gain.value = 0.55; musicBus.connect(master);
      const n = A.sampleRate, b = A.createBuffer(1, n, n), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; noiseBuf = b; }
    if (A.state === 'suspended') A.resume(); } catch { } return A; }
function unlock() { const a = ctx(); if (!a) return; try { const s = a.createBufferSource(); s.buffer = a.createBuffer(1, 1, 22050); s.connect(a.destination); s.start(0); } catch { } }   // iOS: play silence inside the gesture
for (const ev of ['pointerdown', 'touchend', 'keydown']) addEventListener(ev, unlock, { once: true, passive: true });
const ready = () => A && A.state === 'running' && !muted && vol > 0;
function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
function tone(f, { type = 'sine', at = 0, a = 0.01, dec = 0.2, v = 0.3, f1 = null, pan = 0 } = {}) {
  if (!ready()) return; const t = A.currentTime + at, o = A.createOscillator(), g = A.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + a + dec);
  env(g, t, a, v, dec); let out = g; if (pan && A.createStereoPanner) { const p = A.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; } o.connect(g); out.connect(bus); o.start(t); o.stop(t + a + dec + 0.05); }
function noise({ at = 0, a = 0.005, dec = 0.2, v = 0.3, f = 1200, f1 = null, q = 1, type = 'bandpass' } = {}) {
  if (!ready()) return; const t = A.currentTime + at, s = A.createBufferSource(), fl = A.createBiquadFilter(), g = A.createGain(); s.buffer = noiseBuf; s.loop = true;
  fl.type = type; fl.frequency.setValueAtTime(f, t); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + a + dec); fl.Q.value = q; env(g, t, a, v, dec);
  s.connect(fl).connect(g).connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + a + dec + 0.05); }
const notes = (seq, type = 'triangle', v = 0.18) => seq.forEach(([f, at, d]) => tone(f, { type, at, dec: d, v }));
// ---------- sample bank ----------
const BANK = { groan: 6, breath: 3, shriek: 4, attack: 5, step: 4, crawl: 4, roar: 3, hit: 3, bite: 3, headshot: 0, shotgun: 0, pump: 0, firestorm: 0, boom: 0, flame_start: 0, flame_loop: 0, flame_end: 0, beam_loop: 0, reload: 0, pistol_reload: 0, pistol: 0, heartbeat: 0, horde: 0 };
const BUF = {}, lastVar = {}, loaded = { n: 0, total: 0, ok: 0, fail: 0 }; let loading = null;
function decode(ab) { return new Promise((res, rej) => { try { const p = A.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); } catch (e) { rej(e); } }); }   // Safari: callback form
function loadBank(base) { if (loading) return loading; if (!ctx()) return Promise.resolve(); const files = [];
  for (const [k, n] of Object.entries(BANK)) { BUF[k] = []; if (n) for (let i = 1; i <= n; i++) files.push([k, `${k}${i}.mp3`]); else files.push([k, `${k}.mp3`]); }
  loaded.total = files.length;
  loading = Promise.all(files.map(([k, f]) => fetch(base + f).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then(decode).then(b => { BUF[k].push(b); loaded.ok++; }).catch(() => { loaded.fail++; }).finally(() => loaded.n++)));
  return loading; }
const pick = k => { const a = BUF[k]; if (!a || !a.length) return null; if (a.length === 1) return a[0]; let i; do i = Math.floor(Math.random() * a.length); while (i === lastVar[k] && a.length > 1); lastVar[k] = i; return a[i]; };
let voices = 0; const MAXV = coarse ? 16 : 28;
function panner(x, y, z, ref, max, roll) { const p = A.createPanner(); p.panningModel = coarse ? 'equalpower' : 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.maxDistance = max; p.rolloffFactor = roll;
  if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z); return p; }
// one-shot sample. pos = [x,y,z] for 3D (null = in your head). rate/var = playback rate + random spread. Returns the source (or null).
function play(k, { pos = null, v = 1, rate = 1, vr = 0.08, ref = 2.2, max = 45, roll = 1.15, at = 0, out = null } = {}) {
  if (!ready() || voices >= MAXV) return null; const b = pick(k); if (!b) return null; const t = A.currentTime + at, s = A.createBufferSource(), g = A.createGain();
  s.buffer = b; s.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * vr); g.gain.value = v; let n = s.connect(g); if (pos) n = n.connect(panner(pos[0], pos[1], pos[2], ref, max, roll)); n.connect(out || bus);
  voices++; s.onended = () => { voices--; try { s.disconnect(); } catch { } }; s.start(t); return s; }
// looping bed (flamethrower, beam, horde). Returns { set(v,pos), stop(fade) }.
function loop(k, { pos = null, v = 1, rate = 1, ref = 2.5, max = 45, out = null } = {}) {
  if (!A || !BUF[k]?.length) return null; const s = A.createBufferSource(), g = A.createGain(); s.buffer = BUF[k][0]; s.loop = true; const d = s.buffer.duration; s.loopStart = Math.min(0.06, d * 0.1); s.loopEnd = Math.max(s.loopStart + 0.1, d - 0.06);
  s.playbackRate.value = rate; g.gain.value = 0.0001; g.gain.setTargetAtTime(v, A.currentTime, 0.04); let p = null, n = s.connect(g); if (pos) { p = panner(pos[0], pos[1], pos[2], ref, max, 1.1); n = n.connect(p); } n.connect(out || bus); s.start(0, s.loopStart);
  return { set(nv, np) { g.gain.setTargetAtTime(nv, A.currentTime, 0.08); if (p && np) { if (p.positionX) { p.positionX.value = np[0]; p.positionY.value = np[1]; p.positionZ.value = np[2]; } else p.setPosition(...np); } },
    stop(f = 0.12) { try { g.gain.setTargetAtTime(0.0001, A.currentTime, f / 3); s.stop(A.currentTime + f + 0.05); } catch { } } }; }
function listen(x, y, z, yaw) { if (!A) return; const L = A.listener, fx = Math.sin(yaw), fz = Math.cos(yaw);
  if (L.positionX) { L.positionX.value = x; L.positionY.value = y; L.positionZ.value = z; L.forwardX.value = fx; L.forwardY.value = 0; L.forwardZ.value = fz; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
  else { L.setPosition(x, y, z); L.setOrientation(fx, 0, fz, 0, 1, 0); } }
// ---------- heartbeat: BPM + volume follow intensity (0..1); the rest of the mix gets muffled as it rises ----------
const HB = { i: 0, bpm: 0, next: 0, cutoff: 20000, onBeat: null };
function heartbeat(i) { HB.i = i; if (!A) return; const now = A.currentTime;
  HB.cutoff = i > 0.05 ? Math.max(700, 20000 * Math.pow(1 - i * 0.93, 2.2)) : 20000; muffle.frequency.setTargetAtTime(HB.cutoff, now, 0.25);
  if (i < 0.05) { HB.bpm = 0; return; } HB.bpm = Math.round(68 + 92 * i); const gap = 60 / HB.bpm;
  if (HB.next < now) HB.next = now + 0.05;
  if (HB.next - now < 0.12) { if (ready()) play('heartbeat', { v: 0.35 + 0.75 * i, rate: 1 + 0.25 * i, vr: 0.02, at: HB.next - now, out: hbBus }); const at = HB.next; HB.next += gap; HB.onBeat?.(i, at - now); } }
let lastShot = 0;
export const sfx = {
  unlock, get vol() { return vol; }, get muted() { return muted; }, get ctx_() { return A; }, get musicBus() { ctx(); return musicBus; }, get hb() { return HB; }, get bank() { return loaded; },
  setVol(x) { vol = Math.min(1, Math.max(0, x)); localStorage[LS] = vol; if (master) master.gain.value = muted ? 0 : vol; },
  setMuted(m) { muted = !!m; localStorage[MUTE] = muted ? '1' : '0'; if (master) master.gain.value = muted ? 0 : vol; },
  loadBank, play, loop, listen, heartbeat, has: k => !!BUF[k]?.length,
  // d = distance in metres; quieter and duller with distance, nothing beyond 35 m (synth fallback when the bank isn't loaded)
  groan(d = 5, pan = 0) { if (d > 35) return; const k = 1 / (1 + d / 6), f = 70 + Math.random() * 50; tone(f, { type: 'sawtooth', a: 0.15, dec: 0.6 + Math.random() * 0.4, v: 0.12 * k, f1: f * 0.7, pan });
    noise({ a: 0.12, dec: 0.6, v: 0.05 * k, f: 300 + 600 * k, q: 4, pan }); },
  shot(w, mine = true) { const n = performance.now(); if (n - lastShot < (w === 2 || w === 3 ? 0 : 90)) return; lastShot = n; const k = mine ? 1 : 0.4;
    if (w === 2) { noise({ dec: 0.25, v: 0.35 * k, f: 900, f1: 200, type: 'lowpass' }); tone(90, { dec: 0.18, v: 0.25 * k, f1: 45 }); }          // shotgun-style burst: boom
    else if (w === 3) { tone(220, { dec: 0.25, v: 0.15 * k, f1: 80 }); noise({ at: 0.05, dec: 0.3, v: 0.12 * k, f: 500, type: 'lowpass' }); }   // napalm lob: thoop
    else if (w === 4) { tone(1400, { type: 'square', dec: 0.08, v: 0.05 * k, f1: 600 }); noise({ dec: 0.08, v: 0.06 * k, f: 4000, type: 'highpass' }); }   // beam: zap
    else if (w === 1) noise({ a: 0.02, dec: 0.16, v: 0.12 * k, f: 500, f1: 300, q: 0.8 });   // hellfire: low roar
    else noise({ a: 0.02, dec: 0.14, v: 0.09 * k, f: 1800, f1: 900, q: 0.7 }); },              // flamethrower: hiss
  rip(v = 1) { noise({ dec: 0.3, v: 0.25 * v, f: 2400, f1: 300, q: 2 }); tone(140, { dec: 0.15, v: 0.15 * v, f1: 60 }); },
  hammer() { tone(320, { dec: 0.1, v: 0.25, f1: 140 }); noise({ dec: 0.05, v: 0.12, f: 3000, type: 'highpass' }); tone(300, { at: 0.11, dec: 0.1, v: 0.2, f1: 130 }); },
  // Short, procedural weapon-handling cues: no external sample dependency.
  reloadWeapon(kind = 'shotgun') { if (kind === 'marksman_rifle') { noise({ dec: 0.08, v: 0.11, f: 2600, f1: 900, q: 1.8, type: 'highpass' }); tone(680, { at: 0.18, type: 'square', dec: 0.055, v: 0.07, f1: 420 }); noise({ at: 0.62, dec: 0.12, v: 0.13, f: 1800, f1: 500, q: 2 }); tone(240, { at: 1.22, dec: 0.09, v: 0.09, f1: 110 }); } else { noise({ dec: 0.07, v: 0.1, f: 2200, f1: 700, q: 1.5, type: 'highpass' }); tone(380, { at: 0.22, type: 'square', dec: 0.06, v: 0.06, f1: 240 }); for (let i = 0; i < 3; i++) noise({ at: 0.48 + i * 0.34, dec: 0.045, v: 0.085, f: 3200, f1: 1300, q: 2, type: 'highpass' }); tone(210, { at: 1.58, dec: 0.1, v: 0.08, f1: 100 }); } },
  box() { notes([[784, 0, 0.2], [988, 0.12, 0.2], [1175, 0.24, 0.2], [1568, 0.36, 0.35], [1319, 0.5, 0.25], [1568, 0.62, 0.5]], 'triangle', 0.14); },
  perk() { tone(300, { type: 'sine', dec: 0.25, v: 0.15, f1: 900 }); notes([[659, 0.2, 0.15], [880, 0.3, 0.3]], 'sine', 0.14); noise({ at: 0.05, dec: 0.25, v: 0.05, f: 6000, type: 'highpass' }); },
  door() { tone(110, { type: 'sawtooth', a: 0.05, dec: 0.5, v: 0.08, f1: 70 }); noise({ a: 0.05, dec: 0.5, v: 0.08, f: 400, f1: 150, type: 'lowpass' }); notes([[523, 0.35, 0.2], [784, 0.45, 0.3]], 'triangle', 0.1); },
  buy() { notes([[880, 0, 0.08], [1320, 0.07, 0.15]], 'square', 0.05); },
  radio() { noise({ dec: 0.35, v: 0.08, f: 2500, q: 3 }); notes([[1046, 0.3, 0.08], [1046, 0.42, 0.08], [784, 0.54, 0.25]], 'square', 0.04); },
  roundStart() { notes([[147, 0, 0.6], [220, 0.05, 0.6], [196, 0.6, 0.9]], 'sawtooth', 0.06); tone(55, { a: 0.1, dec: 1.4, v: 0.18 }); },
  roundEnd() { notes([[392, 0, 0.3], [330, 0.25, 0.3], [262, 0.5, 0.8]], 'triangle', 0.12); },
  hurt() { tone(160, { type: 'square', dec: 0.12, v: 0.08, f1: 90 }); noise({ dec: 0.1, v: 0.1, f: 700, type: 'lowpass' }); },
};
