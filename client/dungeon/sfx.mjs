// Lightweight, procedural combat sound effects for Eternal Grind.
// No external files or dependencies. Audio is initialized only after a player gesture.
let ctx = null, master = null, noiseBuffer = null;
let enabled = true;
try { enabled = localStorage.getItem('egSfxMute') !== '1'; } catch {}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function init() {
  if (ctx) return ctx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  try {
    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.22 : 0;
    master.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.35), ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return ctx;
  } catch { ctx = null; master = null; return null; }
}
function tone(freq, endFreq, duration, type = 'sine', volume = 0.35, delay = 0) {
  if (!ctx || !master || !enabled) return;
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(Math.max(20, freq), t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + duration);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), t + Math.min(0.012, duration * 0.25));
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  o.connect(g).connect(master); o.start(t); o.stop(t + duration + 0.015);
}
function noise(duration, volume = 0.25, lowpass = 4200, delay = 0) {
  if (!ctx || !master || !noiseBuffer || !enabled) return;
  const t = ctx.currentTime + delay, src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuffer; filter.type = 'lowpass'; filter.frequency.setValueAtTime(lowpass, t);
  g.gain.setValueAtTime(Math.max(0.0001, volume), t); g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  src.connect(filter).connect(g).connect(master); src.start(t); src.stop(t + duration + 0.01);
}
export function play(name) {
  if (!enabled) return;
  const c = init(); if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  switch (name) {
    case 'swing': noise(0.16, 0.13, 2600); tone(260, 95, 0.14, 'triangle', 0.09); break;
    case 'impact': noise(0.11, 0.25, 1800); tone(115, 55, 0.12, 'triangle', 0.22); break;
    case 'critical': noise(0.15, 0.3, 3200); tone(620, 210, 0.18, 'sawtooth', 0.15); break;
    case 'magic': tone(720, 280, 0.2, 'sine', 0.12); tone(420, 920, 0.16, 'triangle', 0.07, 0.035); break;
    case 'enemy-shot': tone(240, 760, 0.22, 'sawtooth', 0.1); noise(0.08, 0.08, 2200); break;
    case 'player-hit': noise(0.18, 0.3, 850); tone(100, 48, 0.2, 'triangle', 0.24); break;
    case 'death': tone(180, 42, 0.62, 'sawtooth', 0.16); tone(92, 36, 0.7, 'sine', 0.18, 0.06); break;
    case 'heal': tone(390, 780, 0.22, 'sine', 0.1); tone(590, 990, 0.3, 'triangle', 0.07, 0.08); break;
    case 'stagger': tone(180, 70, 0.17, 'square', 0.08); noise(0.06, 0.12, 1200); break;
    case 'guardian': tone(90, 55, 0.5, 'sawtooth', 0.14); tone(66, 40, 0.65, 'sine', 0.12, 0.08); break;
  }
}
export function setEnabled(value) {
  enabled = !!value;
  try { localStorage.setItem('egSfxMute', enabled ? '0' : '1'); } catch {}
  if (master && ctx) master.gain.setTargetAtTime(enabled ? 0.22 : 0, ctx.currentTime, 0.025);
  return enabled;
}
export function isEnabled() { return enabled; }
export function unlock() { const c = init(); if (c && c.state === 'suspended') c.resume().catch(() => {}); }
export default { play, setEnabled, isEnabled, unlock };
