// Zombies music: Derrik's "Burn City Lives" plays once when a zombies match starts, then the BURN playlist (client/music/playlist.json)
// takes over in a shuffled order and keeps going; Burn City Lives is not queued again until the next match. Runs through the arena's
// WebAudio master, so the sound volume slider, mute (M) and the iOS first-tap unlock all apply. Music can be turned off in settings
// (localStorage bcMusic = '0').
export function createMusic(sfx, { root = '../music/' } = {}) {
  const INTRO = { title: 'Burn City Lives', src: root + 'burn-city-lives.mp3' };
  let el = null, node = null, list = null, queue = [], cur = null, on = localStorage.bcMusic !== '0', active = false, pend = false, played = [];
  async function playlist() { if (list) return list; try { list = (await (await fetch(root + 'playlist.json')).json()).map(t => ({ title: t.title, src: root + String(t.src).replace(/^music\//, '') })); } catch { list = []; } return list; }
  function media() { if (el) return el; el = new Audio(); el.preload = 'auto'; el.crossOrigin = 'anonymous'; el.playsInline = true; el.setAttribute('playsinline', '');
    el.addEventListener('ended', () => next()); el.addEventListener('error', () => { if (active) setTimeout(next, 500); });
    try { const A = sfx.ctx_ || (sfx.unlock(), sfx.ctx_); if (A && sfx.musicBus) { node = A.createMediaElementSource(el); node.connect(sfx.musicBus); } } catch { node = null; }   // through the master (volume + mute); falls back to the element's own output
    return el; }
  function vol() { if (!el) return; if (!node) { el.volume = sfx.muted ? 0 : Math.min(1, sfx.vol * 1.6); el.muted = sfx.muted; } }
  function load(t) { cur = t; played.push(t.title); const e = media(); e.src = t.src; vol(); tryPlay(); }
  function tryPlay() { if (!el || !active || !on) return; const p = el.play(); if (p && p.catch) p.then(() => { pend = false; }, () => { pend = true; }); }
  async function next() { if (!active) return; const L = await playlist(); if (!L.length) return;
    if (!queue.length) { queue = L.slice(); for (let i = queue.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [queue[i], queue[j]] = [queue[j], queue[i]]; } if (cur && queue.length > 1 && queue[0].src === cur.src) queue.push(queue.shift()); }
    load(queue.shift()); }
  // iOS/Android: if the first play() was refused (no gesture yet), retry on the next tap/key
  for (const ev of ['pointerdown', 'touchend', 'keydown']) addEventListener(ev, () => { if (pend) tryPlay(); }, { passive: true });
  setInterval(vol, 500);
  return {
    get state() { return { active, on, track: cur?.title || null, paused: el ? el.paused : true, t: el ? Math.round(el.currentTime) : 0, played: played.slice(-12), queue: queue.map(t => t.title), viaWebAudio: !!node }; },
    startMatch() { active = true; queue = []; played = []; playlist(); load(INTRO); },   // once per match, never looped
    stop() { active = false; pend = false; if (el) { el.pause(); } },
    setOn(v) { on = !!v; localStorage.bcMusic = on ? '1' : '0'; if (!el) return; if (on && active) tryPlay(); else el.pause(); },
    get on() { return on; },
    skip() { next(); },   // test hook: jump to the next track
    _seekEnd() { if (el && el.duration) el.currentTime = Math.max(0, el.duration - 1.5); },   // test hook
  };
}
