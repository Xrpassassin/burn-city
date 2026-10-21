// BURN City: The Wilds — music + forest ambience.
// Derrik's songs: "Whispers of the Wilderness" (exploring the forest) and "Beneath the Hollow" (encounters / fight zones).
// Both play through one Web Audio graph so fades work on iOS too (iOS ignores HTMLAudioElement.volume).
// The graph is created inside a tap (the PROCEED button), which is what unlocks audio on iOS Safari.
// Audible only while the game's sound toggle (🔊) is on, or when the city music player was already playing when you walked in.
const SRC = { forest: 'music/wilds/whispers-of-the-wilderness.mp3', battle: 'music/wilds/beneath-the-hollow.mp3' };
const VOL = { forest: .55, battle: .7, amb: .32 };
let AC = null, master = null, ambG = null, sfxG = null, tracks = {}, want = null, audible = false, cityWas = false, lastSound = null, amb = null;
const C = () => window.__city;
const soundOn = () => { const c = C(); return !!(c && c.soundOn && c.soundOn()); };
const CM = () => window.__cityMusic;

// Only the forest track is created on entry; the battle track is created (and fetched) when the first encounter starts,
// or prefetched a few seconds after entering. Nothing here runs until you PROCEED into the forest (wilds-gate.js).
let unlockFn = null, battleT = 0;
function track(k, preload = 'auto') {
  if (tracks[k]) { if (preload === 'auto' && tracks[k].el.preload !== 'auto') { tracks[k].el.preload = 'auto'; try { tracks[k].el.load(); } catch (e) { } } return tracks[k]; }
  const el = new Audio(); el.preload = preload; el.loop = true; el.crossOrigin = 'anonymous'; el.setAttribute('playsinline', ''); el.src = SRC[k];
  let node = null; try { node = AC.createMediaElementSource(el); } catch (e) { }
  const g = AC.createGain(); g.gain.value = 0; if (node) node.connect(g); g.connect(master);
  return (tracks[k] = { el, g, node, on: false });
}
function ensure() {
  if (AC) { if (AC.state === 'suspended') AC.resume().catch(() => { }); return true; }
  try { AC = window.__wildsAC || new (window.AudioContext || window.webkitAudioContext)(); window.__wildsAC = null; if (AC.state === 'suspended') AC.resume().catch(() => { }); } catch (e) { return false; }   // the gate may have created it inside the PROCEED tap
  master = AC.createGain(); master.gain.value = 0; master.connect(AC.destination);
  ambG = AC.createGain(); ambG.gain.value = 0; ambG.connect(master);
  sfxG = AC.createGain(); sfxG.gain.value = .5; sfxG.connect(master);
  if (!unlockFn) { unlockFn = () => { if (AC && AC.state !== 'running') AC.resume().catch(() => { }); for (const k in tracks) if (tracks[k].on && tracks[k].el.paused) tracks[k].el.play().catch(() => { }); }; for (const ev of ['pointerdown', 'touchend', 'keydown']) addEventListener(ev, unlockFn, true); }
  buildAmbience(); return true;
}
function ramp(param, v, sec) { const t = AC.currentTime; param.cancelScheduledValues(t); param.setValueAtTime(param.value, t); param.linearRampToValueAtTime(v, t + sec); }
function playTrack(k, sec) {
  for (const n in tracks) { const tr = tracks[n];
    if (n === k) { tr.on = true; if (tr.el.paused) tr.el.play().catch(() => { }); ramp(tr.g.gain, VOL[n], sec); }
    else if (tr.on) { tr.on = false; ramp(tr.g.gain, 0, sec); const el = tr.el; setTimeout(() => { if (!tracks[n].on) el.pause(); }, sec * 1000 + 120); }
  }
}
// procedural ambience: wind through leaves (filtered noise with slow gusts), day birds, night crickets
function buildAmbience() {
  const len = AC.sampleRate * 3, nb = AC.createBuffer(1, len, AC.sampleRate), d = nb.getChannelData(0); let l = 0;
  for (let i = 0; i < len; i++) { l = (l + .02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.2; }
  const n = AC.createBufferSource(); n.buffer = nb; n.loop = true; const lp = AC.createBiquadFilter(); lp.type = 'bandpass'; lp.frequency.value = 900; lp.Q.value = .4;
  const wg = AC.createGain(); wg.gain.value = .35; const lfo = AC.createOscillator(); lfo.frequency.value = .09; const lg = AC.createGain(); lg.gain.value = .22; lfo.connect(lg).connect(wg.gain); lfo.start();
  n.connect(lp).connect(wg).connect(ambG); n.start();
  amb = { nb, next: 1 };
}
function chirp(day) {
  if (!AC || !audible) return; const t0 = AC.currentTime, g = AC.createGain(), o = AC.createOscillator(); o.type = 'sine'; g.connect(ambG); o.connect(g);
  if (day > .35) { // bird: a few quick falling/rising whistles
    const f = 2200 + Math.random() * 1800, n = 2 + (Math.random() * 4 | 0); g.gain.value = 0;
    for (let i = 0; i < n; i++) { const t = t0 + i * .13; o.frequency.setValueAtTime(f * (1 + (i % 2) * .15), t); o.frequency.exponentialRampToValueAtTime(f * (.7 + Math.random() * .2), t + .09); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.07, t + .02); g.gain.linearRampToValueAtTime(0, t + .1); }
    o.start(t0); o.stop(t0 + n * .13 + .1);
  } else { // cricket: rapid pulses of a high tone
    o.frequency.value = 4300 + Math.random() * 500; g.gain.value = 0;
    for (let i = 0; i < 9; i++) { const t = t0 + i * .045; g.gain.setValueAtTime(.025, t); g.gain.setValueAtTime(0, t + .022); }
    o.start(t0); o.stop(t0 + .45);
  }
}
export function sfx(kind) {
  if (!AC || !audible) return; const t0 = AC.currentTime, g = AC.createGain(); g.connect(sfxG);
  const tone = (f, t, dur, type = 'sine', v = .3, f2) => { const o = AC.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t0 + t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + t + dur); const gg = AC.createGain(); gg.gain.setValueAtTime(0, t0 + t); gg.gain.linearRampToValueAtTime(v, t0 + t + .01); gg.gain.exponentialRampToValueAtTime(.001, t0 + t + dur); o.connect(gg).connect(g); o.start(t0 + t); o.stop(t0 + t + dur + .05); };
  const noise = (t, dur, f, v = .4) => { const s = AC.createBufferSource(); s.buffer = amb.nb; const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; const gg = AC.createGain(); gg.gain.setValueAtTime(v, t0 + t); gg.gain.exponentialRampToValueAtTime(.001, t0 + t + dur); s.connect(bp).connect(gg).connect(g); s.start(t0 + t); s.stop(t0 + t + dur + .05); };
  if (kind === 'hit') { noise(0, .18, 500, .6); tone(140, 0, .2, 'triangle', .35, 60); }
  else if (kind === 'miss') { noise(0, .25, 2400, .25); }
  else if (kind === 'bind') { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * .09, .5, 'sine', .22)); }
  else if (kind === 'bindfail') { noise(0, .35, 1200, .5); tone(300, 0, .3, 'sawtooth', .12, 120); }
  else if (kind === 'calm') { [392, 494, 587].forEach((f, i) => tone(f, i * .14, .8, 'sine', .16)); }
  else if (kind === 'level') { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * .07, .45, 'triangle', .2)); }
  else if (kind === 'discover') { tone(880, 0, .6, 'sine', .18); tone(1320, .12, .7, 'sine', .14); }
  else if (kind === 'warn') { tone(220, 0, .5, 'sawtooth', .1, 180); tone(330, 0, .5, 'sawtooth', .06, 260); }
  else if (kind === 'ui') { tone(660, 0, .08, 'sine', .12); }
}

// ---- public API (called by wilds.js)
export function unlock() { return ensure(); }   // call from a user gesture
export function enterForest() {
  if (!ensure()) return;
  cityWas = !!(CM() && CM().playing && CM().playing()); if (cityWas) CM().fadeOut(1800);
  track('forest'); clearTimeout(battleT); battleT = setTimeout(() => { if (AC && want) track('battle'); }, 9000);   // battle music: prefetched after entry (or on the first encounter, whichever comes first)
  want = 'forest'; audible = soundOn() || cityWas; lastSound = soundOn(); ramp(master.gain, audible ? 1 : 0, .4); ramp(ambG.gain, VOL.amb, 3); playTrack('forest', 3.5);
}
export function leaveForest() {
  if (!AC) return; want = null; playTrack('none', 2.5); ramp(ambG.gain, 0, 2.5);
  const cm = CM(); if (cm && (cityWas || (audible && soundOn()))) cm.fadeIn(2500);
  cityWas = false;
}
export function fight(on) { if (!AC || !want) return; if (on) track('battle'); want = on ? 'battle' : 'forest'; playTrack(want, on ? 1.2 : 2.5); }
export function update(dt, day) {
  if (!AC || !want) return;
  // the sound toggle stays the boss: muting while in the forest silences it, unmuting brings it back
  const s = soundOn(); if (s !== lastSound) { lastSound = s; audible = s; ramp(master.gain, audible ? 1 : 0, .5); }
  amb.next -= dt; if (amb.next < 0) { amb.next = day > .35 ? 1.5 + Math.random() * 5 : .6 + Math.random() * 1.6; chirp(day); }
}
// unload: stop everything and release the media elements + the audio graph (re-entering builds it again)
export function dispose() {
  clearTimeout(battleT); want = null; audible = false;
  if (cityWas) { const cm = CM(); if (cm) cm.fadeIn(1500); } cityWas = false;
  for (const k in tracks) { const tr = tracks[k]; try { tr.el.pause(); tr.el.removeAttribute('src'); tr.el.load(); } catch (e) { } try { tr.node && tr.node.disconnect(); tr.g.disconnect(); } catch (e) { } }
  tracks = {};
  if (unlockFn) { for (const ev of ['pointerdown', 'touchend', 'keydown']) removeEventListener(ev, unlockFn, true); unlockFn = null; }
  if (AC) { const a = AC; AC = null; master = ambG = sfxG = null; amb = null; try { a.close(); } catch (e) { } }
}
export function state() { return { ctx: AC && AC.state, want, audible, cityWas, forest: tracks.forest && { on: tracks.forest.on, paused: tracks.forest.el.paused, src: tracks.forest.el.src.split('/').pop(), g: +tracks.forest.g.gain.value.toFixed(2) }, battle: tracks.battle && { on: tracks.battle.on, paused: tracks.battle.el.paused, preload: tracks.battle.el.preload, g: +tracks.battle.g.gain.value.toFixed(2) } }; }
