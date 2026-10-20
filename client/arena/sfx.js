// Synthesized arena SFX (WebAudio only, no files). Master volume default 30%, persisted; soft limiter so nothing is harsh.
let A = null, master = null, comp = null, noiseBuf = null;
const LS = 'bcVol', MUTE = 'bcMute';
let vol = Math.min(1, Math.max(0, +(localStorage[LS] ?? 0.3))), muted = localStorage[MUTE] === '1';
function ctx() {
  try { if (!A) { A = new (window.AudioContext || window.webkitAudioContext)(); comp = A.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 6;
      master = A.createGain(); master.gain.value = muted ? 0 : vol; master.connect(comp).connect(A.destination);
      const n = A.sampleRate, b = A.createBuffer(1, n, n), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; noiseBuf = b; }
    if (A.state === 'suspended') A.resume(); } catch { } return A; }
function unlock() { const a = ctx(); if (!a) return; try { const s = a.createBufferSource(); s.buffer = a.createBuffer(1, 1, 22050); s.connect(a.destination); s.start(0); } catch { } }   // iOS: play silence inside the gesture
for (const ev of ['pointerdown', 'touchend', 'keydown']) addEventListener(ev, unlock, { once: true, passive: true });
const ready = () => A && A.state === 'running' && !muted && vol > 0;
function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
function tone(f, { type = 'sine', at = 0, a = 0.01, dec = 0.2, v = 0.3, f1 = null, pan = 0 } = {}) {
  if (!ready()) return; const t = A.currentTime + at, o = A.createOscillator(), g = A.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + a + dec);
  env(g, t, a, v, dec); let out = g; if (pan && A.createStereoPanner) { const p = A.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; } o.connect(g); out.connect(master); o.start(t); o.stop(t + a + dec + 0.05); }
function noise({ at = 0, a = 0.005, dec = 0.2, v = 0.3, f = 1200, f1 = null, q = 1, type = 'bandpass' } = {}) {
  if (!ready()) return; const t = A.currentTime + at, s = A.createBufferSource(), fl = A.createBiquadFilter(), g = A.createGain(); s.buffer = noiseBuf; s.loop = true;
  fl.type = type; fl.frequency.setValueAtTime(f, t); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + a + dec); fl.Q.value = q; env(g, t, a, v, dec);
  s.connect(fl).connect(g).connect(master); s.start(t, Math.random() * 0.5); s.stop(t + a + dec + 0.05); }
const notes = (seq, type = 'triangle', v = 0.18) => seq.forEach(([f, at, d]) => tone(f, { type, at, dec: d, v }));
let lastShot = 0;
export const sfx = {
  unlock, get vol() { return vol; }, get muted() { return muted; },
  setVol(x) { vol = Math.min(1, Math.max(0, x)); localStorage[LS] = vol; if (master) master.gain.value = muted ? 0 : vol; },
  setMuted(m) { muted = !!m; localStorage[MUTE] = muted ? '1' : '0'; if (master) master.gain.value = muted ? 0 : vol; },
  // d = distance in metres; quieter and duller with distance, nothing beyond 35 m
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
  box() { notes([[784, 0, 0.2], [988, 0.12, 0.2], [1175, 0.24, 0.2], [1568, 0.36, 0.35], [1319, 0.5, 0.25], [1568, 0.62, 0.5]], 'triangle', 0.14); },
  perk() { tone(300, { type: 'sine', dec: 0.25, v: 0.15, f1: 900 }); notes([[659, 0.2, 0.15], [880, 0.3, 0.3]], 'sine', 0.14); noise({ at: 0.05, dec: 0.25, v: 0.05, f: 6000, type: 'highpass' }); },
  door() { tone(110, { type: 'sawtooth', a: 0.05, dec: 0.5, v: 0.08, f1: 70 }); noise({ a: 0.05, dec: 0.5, v: 0.08, f: 400, f1: 150, type: 'lowpass' }); notes([[523, 0.35, 0.2], [784, 0.45, 0.3]], 'triangle', 0.1); },
  buy() { notes([[880, 0, 0.08], [1320, 0.07, 0.15]], 'square', 0.05); },
  roundStart() { notes([[147, 0, 0.6], [220, 0.05, 0.6], [196, 0.6, 0.9]], 'sawtooth', 0.06); tone(55, { a: 0.1, dec: 1.4, v: 0.18 }); },
  roundEnd() { notes([[392, 0, 0.3], [330, 0.25, 0.3], [262, 0.5, 0.8]], 'triangle', 0.12); },
  hurt() { tone(160, { type: 'square', dec: 0.12, v: 0.08, f1: 90 }); noise({ dec: 0.1, v: 0.1, f: 700, type: 'lowpass' }); },
};
