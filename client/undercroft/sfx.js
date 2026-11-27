// Procedural WebAudio sound (no files): swings, hits, blocks, fire, heal, bones, chests, locks, ambience and a level-up fanfare.
let AC = null, master = null, amb = null, muted = false;
export function initAudio() { if (AC) { if (AC.state === 'suspended') AC.resume(); return; } try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = muted ? 0 : .6; master.connect(AC.destination); } catch (e) { AC = null; } }
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : .6; }
export const isMuted = () => muted;
function noise(dur) { const b = AC.createBuffer(1, Math.max(1, AC.sampleRate * dur | 0), AC.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = AC.createBufferSource(); s.buffer = b; return s; }
function env(node, t0, a, peak, dec) { const g = AC.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(.0008, t0 + a + dec); node.connect(g); return g; }
function out(n, vol = 1, pan = 0) { const g = AC.createGain(); g.gain.value = vol; let x = n; if (AC.createStereoPanner) { const p = AC.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); x.connect(p); x = p; } x.connect(g); g.connect(master); }
function tone(type, f0, f1, t0, dur, vol, pan) { const o = AC.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t0); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur); out(env(o, t0, .005, vol, dur), 1, pan); o.start(t0); o.stop(t0 + dur + .05); }
function burst(t0, dur, f, q, vol, type = 'bandpass', f1, pan) { const n = noise(dur + .05), bq = AC.createBiquadFilter(); bq.type = type; bq.frequency.setValueAtTime(f, t0); if (f1) bq.frequency.exponentialRampToValueAtTime(f1, t0 + dur); bq.Q.value = q; n.connect(bq); out(env(bq, t0, .004, vol, dur), 1, pan); n.start(t0); n.stop(t0 + dur + .05); }
export function play(name, pan = 0, vol = 1) {
  if (!AC || muted) return; const t = AC.currentTime;
  switch (name) {
    case 'swing': burst(t, .18, 900, 1.2, .35 * vol, 'bandpass', 2600, pan); break;
    case 'heavy': burst(t, .32, 500, 1, .45 * vol, 'bandpass', 1800, pan); break;
    case 'hit': tone('sine', 140, 60, t, .16, .55 * vol, pan); burst(t, .09, 1800, .8, .4 * vol, 'bandpass', 600, pan); break;
    case 'crit': tone('triangle', 220, 80, t, .2, .5 * vol, pan); burst(t, .12, 2600, .7, .5 * vol, 'highpass', 900, pan); break;
    case 'block': [1250, 1870, 2610].forEach((f, i) => tone('square', f, f * .98, t, .22 - i * .04, .07 * vol, pan)); burst(t, .05, 3000, 2, .25, 'bandpass', 0, pan); break;
    case 'perfect': [1500, 2250, 3000, 4200].forEach((f, i) => tone('sine', f, f, t + i * .02, .5, .09 * vol, pan)); break;
    case 'hurt': tone('sawtooth', 180, 90, t, .18, .18 * vol, pan); burst(t, .12, 700, 1, .3 * vol, 'lowpass', 300, pan); break;
    case 'dodge': burst(t, .25, 600, .7, .25 * vol, 'bandpass', 250, pan); break;
    case 'fire': burst(t, .45, 300, .6, .55 * vol, 'lowpass', 2400, pan); tone('sawtooth', 90, 45, t, .4, .1 * vol, pan); break;
    case 'boom': burst(t, .6, 900, .5, .7 * vol, 'lowpass', 120, pan); tone('sine', 80, 35, t, .5, .5 * vol, pan); break;
    case 'heal': [523, 659, 784, 1047].forEach((f, i) => tone('sine', f, f, t + i * .07, .6, .12 * vol, pan)); break;
    case 'frost': [880, 1320].forEach((f, i) => tone('triangle', f, f * 1.5, t + i * .03, .35, .12 * vol, pan)); burst(t, .3, 4000, 1, .15 * vol, 'highpass', 0, pan); break;
    case 'bones': for (let i = 0; i < 6; i++) burst(t + i * .05 + Math.random() * .03, .04, 1500 + Math.random() * 1500, 4, .25 * vol, 'bandpass', 0, pan); break;
    case 'alert': tone('sawtooth', 110, 70, t, .5, .12 * vol, pan); break;
    case 'death': for (let i = 0; i < 10; i++) burst(t + i * .06, .05, 900 + Math.random() * 1800, 3, .25 * vol, 'bandpass', 0, pan); tone('sine', 90, 40, t, .7, .2 * vol, pan); break;
    case 'chest': tone('sawtooth', 160, 110, t, .5, .06 * vol, pan); burst(t + .3, .2, 300, 1, .2 * vol, 'lowpass', 0, pan); break;
    case 'coins': for (let i = 0; i < 7; i++) tone('sine', 2400 + Math.random() * 1600, 0, t + i * .05, .12, .07 * vol, pan); break;
    case 'click': tone('square', 2200, 1800, t, .04, .1 * vol, pan); break;
    case 'snap': burst(t, .08, 3500, 2, .4 * vol, 'highpass', 0, pan); tone('square', 900, 300, t, .1, .08 * vol, pan); break;
    case 'unlock': [660, 990].forEach((f, i) => tone('triangle', f, f, t + i * .08, .3, .14 * vol, pan)); break;
    case 'ped': [392, 587, 784].forEach((f, i) => tone('sine', f, f, t + i * .06, 1.2, .1 * vol, pan)); break;
    case 'pedoff': tone('sine', 300, 150, t, .6, .1 * vol, pan); break;
    case 'gate': burst(t, 2.4, 140, .6, .35 * vol, 'lowpass', 60, pan); for (let i = 0; i < 12; i++) tone('square', 90 + i * 3, 0, t + i * .18, .08, .05 * vol, pan); break;
    case 'spikes': burst(t, .12, 2200, 1.5, .25 * vol, 'bandpass', 900, pan); break;
    case 'step': burst(t, .05, 380 + Math.random() * 120, 1.2, .08 * vol, 'lowpass', 0, pan); break;
    case 'blink': tone('sine', 1200, 300, t, .35, .1 * vol, pan); break;
    case 'ring': tone('sawtooth', 60, 120, t, 1.1, .12 * vol, pan); burst(t, 1.1, 200, .5, .2 * vol, 'lowpass', 900, pan); break;
    case 'roar': tone('sawtooth', 70, 45, t, 1.4, .3 * vol, pan); burst(t, 1.2, 400, .5, .4 * vol, 'lowpass', 150, pan); break;
    case 'potion': for (let i = 0; i < 4; i++) tone('sine', 300 + i * 90, 500 + i * 90, t + i * .09, .1, .08 * vol, pan); break;
    case 'quest': [392, 523, 659, 784].forEach((f, i) => tone('triangle', f, f, t + i * .12, .9, .12 * vol, pan)); break;
    case 'levelup': [262, 330, 392, 523, 659, 784, 1047].forEach((f, i) => { tone('triangle', f, f, t + i * .09, 1.6, .11 * vol, pan); tone('sine', f * 2, f * 2, t + i * .09, 1.2, .04 * vol, pan); }); break;
    case 'skill': [784, 1175].forEach((f, i) => tone('sine', f, f, t + i * .08, .5, .08 * vol, pan)); break;
  }
}
export function ambience(on) {
  if (!AC) return; if (on && !amb) { const n = noise(4); n.loop = true; const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180; const g = AC.createGain(); g.gain.value = .12; n.connect(lp); lp.connect(g); g.connect(master); n.start();
    const o = AC.createOscillator(); o.type = 'sine'; o.frequency.value = 55; const og = AC.createGain(); og.gain.value = .035; o.connect(og); og.connect(master); o.start();
    const drip = setInterval(() => { if (!muted && Math.random() < .5) { const t = AC.currentTime, f = 1400 + Math.random() * 1600; tone('sine', f, f * .5, t, .12, .05, Math.random() * 2 - 1); } }, 1700);
    amb = { n, o, drip }; }
  if (!on && amb) { try { amb.n.stop(); amb.o.stop(); } catch (e) { } clearInterval(amb.drip); amb = null; }
}
export function closeAudio() { ambience(false); if (AC) { try { AC.close(); } catch (e) { } AC = null; } }
