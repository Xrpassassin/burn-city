// Dedicated game-entry menu. Kept separate from the city movement/view controls.
const style = document.createElement('style');
style.textContent = `
#bcPlayOpen{position:fixed;top:12px;right:12px;z-index:68;min-height:44px;padding:0 16px;border:1px solid #ff9a3a;border-radius:11px;background:rgba(18,10,8,.94);color:#fff;font:700 14px monospace;cursor:pointer;box-shadow:0 4px 18px #0006}
#bcPlayOpen:hover{background:#ff7a1a}
#bcPlayPanel{position:fixed;inset:0;z-index:90;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.66)}
#bcPlayPanel.on{display:flex}
#bcPlayPanel .bc-play-card{width:min(440px,100%);max-height:80dvh;overflow:auto;padding:22px;border:1px solid #ff7a1a;border-radius:16px;background:rgba(14,12,18,.98);color:#f5e8da;font:14px/1.5 system-ui;box-shadow:0 18px 60px #000b}
#bcPlayPanel h2{margin:0 0 6px;font:800 22px monospace;color:#ffb66b}
#bcPlayPanel p{margin:0 0 16px;color:#c7c9d4}
#bcPlayPanel .bc-play-entry{display:flex;align-items:center;gap:12px;width:100%;min-height:66px;padding:12px;border:1px solid #ff9a3a88;border-radius:12px;background:#24150f;color:#fff;text-align:left;cursor:pointer}
#bcPlayPanel .bc-play-entry:hover{background:#3a1c0e;border-color:#ff9a3a}
#bcPlayPanel .bc-play-icon{font-size:26px}
#bcPlayPanel .bc-play-entry strong{display:block;font-size:15px}
#bcPlayPanel .bc-play-entry small{display:block;margin-top:3px;color:#d0c1b7}
#bcPlayClose{display:block;margin:16px 0 0 auto;min-height:42px;padding:0 16px;border:1px solid #ffffff40;border-radius:9px;background:#20202a;color:#fff;font:600 14px system-ui;cursor:pointer}
body.wl-travel #bcPlayPanel .bc-play-entry[data-play="blacktide"]{display:none}
@media(max-width:520px){#bcPlayOpen{top:calc(10px + env(safe-area-inset-top));right:10px;padding:0 12px}#bcPlayPanel .bc-play-card{padding:18px}}
`;
document.head.appendChild(style);
const open = document.createElement('button');
open.id = 'bcPlayOpen';
open.type = 'button';
open.textContent = '▶ Play';
open.setAttribute('aria-haspopup','dialog');
open.setAttribute('aria-controls','bcPlayPanel');
const panel = document.createElement('div');
panel.id = 'bcPlayPanel';
panel.setAttribute('role','dialog');
panel.setAttribute('aria-modal','true');
panel.setAttribute('aria-labelledby','bcPlayTitle');
panel.innerHTML = '<div class="bc-play-card"><h2 id="bcPlayTitle">PLAY</h2><p>Choose a world to enter. Movement controls stay separate.</p><button class="bc-play-entry" type="button" data-play="blacktide"><span class="bc-play-icon" aria-hidden="true">⚓</span><span><strong>Blacktide</strong><small>Pirate frontier · sail, trade, and fight across the ocean</small></span></button><button id="bcPlayClose" type="button">Back to BURN City</button></div>';
document.body.append(open, panel);
const close = () => { panel.classList.remove('on'); open.focus(); };
open.addEventListener('click', () => panel.classList.add('on'));
panel.addEventListener('click', e => {
  if (e.target === panel || e.target.closest('#bcPlayClose')) { close(); return; }
  const entry = e.target.closest('[data-play="blacktide"]');
  if (entry) {
    if (document.body.classList.contains('wl-travel')) return;
    if (typeof window.__launchBlacktide === 'function') window.__launchBlacktide();
    else { window.location.href = 'blacktide/'; }
  }
});
addEventListener('keydown', e => { if (e.key === 'Escape' && panel.classList.contains('on')) close(); });
