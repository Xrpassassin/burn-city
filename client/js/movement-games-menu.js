// Unified Movement & Games hub.
// Replaces the separate Transport and Play popovers with one accessible, mobile-safe breakdown.
const style = document.createElement('style');
style.textContent = `
#bcMoveGamesWrap{position:fixed;top:calc(env(safe-area-inset-top,0px) + 12px);right:12px;z-index:80}
#bcMoveGamesOpen{min-height:44px;padding:0 14px;border:1px solid rgba(255,145,65,.6);border-radius:11px;background:rgba(12,10,13,.94);color:#fff;font:700 13px/1 var(--f-mono,monospace);box-shadow:0 4px 18px #0007;white-space:nowrap}
#bcMoveGamesOpen .bc-mg-mark{color:#ff9b4a;margin-right:7px}
#bcMoveGamesPanel{position:fixed;inset:0;z-index:120;display:none;align-items:flex-start;justify-content:flex-end;padding:calc(env(safe-area-inset-top,0px) + 68px) 12px calc(env(safe-area-inset-bottom,0px) + 16px);background:rgba(0,0,0,.34)}
#bcMoveGamesPanel.on{display:flex}
#bcMoveGamesPanel .bc-mg-card{width:min(420px,100%);max-height:calc(100dvh - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px) - 100px);overflow:auto;overscroll-behavior:contain;border:1px solid rgba(255,145,65,.42);border-radius:16px;background:rgba(11,11,17,.98);color:#f6efe9;box-shadow:0 18px 60px #000b;padding:16px}
#bcMoveGamesPanel .bc-mg-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}
#bcMoveGamesPanel h2{font:800 18px/1.25 var(--f-mono,monospace);margin:0;color:#ffb16a}
#bcMoveGamesPanel .bc-mg-sub{margin:5px 0 0;color:#b9b2b0;font:12px/1.45 var(--f-ui,system-ui)}
#bcMoveGamesPanel .bc-mg-close{width:40px;min-width:40px;height:40px;padding:0;border-radius:50%;font-size:19px}
#bcMoveGamesPanel .bc-mg-section{margin-top:14px}
#bcMoveGamesPanel .bc-mg-section-title{display:flex;align-items:center;gap:8px;margin:0 0 8px;color:#e7d9d0;font:800 11px/1.2 var(--f-mono,monospace);letter-spacing:.12em;text-transform:uppercase}
#bcMoveGamesPanel .bc-mg-list{display:grid;grid-template-columns:1fr 1fr;gap:8px}
#bcMoveGamesPanel .bc-mg-entry{display:flex;align-items:flex-start;gap:10px;min-height:72px;width:100%;padding:11px;border:1px solid #ffffff1c;border-radius:11px;background:#ffffff08;color:#fff;text-align:left}
#bcMoveGamesPanel .bc-mg-entry:hover{background:#ff7a1a18;border-color:#ff9a4a99}
#bcMoveGamesPanel .bc-mg-icon{width:26px;flex:0 0 26px;text-align:center;font-size:21px;line-height:1.25}
#bcMoveGamesPanel .bc-mg-entry strong{display:block;font-size:13px;line-height:1.3}
#bcMoveGamesPanel .bc-mg-entry small{display:block;margin-top:4px;color:#b9b2b0;font:11px/1.4 var(--f-ui,system-ui)}
#bcMoveGamesPanel .bc-mg-foot{margin:12px 2px 0;color:#89888f;font:11px/1.45 var(--f-ui,system-ui)}
@media(max-width:520px){
 #bcMoveGamesWrap{right:10px;top:calc(env(safe-area-inset-top,0px) + 10px)}
 #bcMoveGamesOpen{min-width:44px;padding:0 10px;font-size:12px}
 #bcMoveGamesPanel{padding:calc(env(safe-area-inset-top,0px) + 62px) 10px calc(env(safe-area-inset-bottom,0px) + 10px)}
 #bcMoveGamesPanel .bc-mg-card{padding:13px;max-height:calc(100dvh - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px) - 84px)}
 #bcMoveGamesPanel .bc-mg-list{grid-template-columns:1fr}
 #bcMoveGamesPanel .bc-mg-entry{min-height:60px}
}
@media(min-width:521px){#bcMoveGamesPanel{padding-right:12px}}
`;
document.head.appendChild(style);

const wrap = document.createElement('div');
wrap.id = 'bcMoveGamesWrap';
wrap.innerHTML = '<button id="bcMoveGamesOpen" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="bcMoveGamesPanel"><span class="bc-mg-mark" aria-hidden="true">⇄</span>Movement &amp; Games ▾</button>';
const panel = document.createElement('div');
panel.id = 'bcMoveGamesPanel';
panel.setAttribute('role','dialog');
panel.setAttribute('aria-modal','true');
panel.setAttribute('aria-labelledby','bcMoveGamesTitle');
panel.innerHTML = `
 <section class="bc-mg-card">
  <header class="bc-mg-head"><div><h2 id="bcMoveGamesTitle">MOVEMENT &amp; GAMES</h2><p class="bc-mg-sub">Choose how to travel or what to play. Everything in one place.</p></div><button class="bc-mg-close" type="button" aria-label="Close menu">×</button></header>
  <section class="bc-mg-section" aria-labelledby="bcMgMovementTitle">
   <h3 class="bc-mg-section-title" id="bcMgMovementTitle">⌁ Movement &amp; View</h3>
   <div class="bc-mg-list">
    <button class="bc-mg-entry" type="button" data-move="orbit"><span class="bc-mg-icon">◎</span><span><strong>Orbit</strong><small>Rotate around the city overview</small></span></button>
    <button class="bc-mg-entry" type="button" data-move="explore"><span class="bc-mg-icon">🚶</span><span><strong>Explore on foot</strong><small>Walk, run, jump, and interact</small></span></button>
    <button class="bc-mg-entry" type="button" data-move="tour"><span class="bc-mg-icon">▶</span><span><strong>Guided tour</strong><small>Let the city tour guide the camera</small></span></button>
    <button class="bc-mg-entry" type="button" data-move="fly"><span class="bc-mg-icon">✈️</span><span><strong>Flight</strong><small>Free-fly above the city · WASD, Space/C</small></span></button>
    <button class="bc-mg-entry" type="button" data-move="boat"><span class="bc-mg-icon">⛵</span><span><strong>Lake boat</strong><small>Go to the dock and interact with E</small></span></button>
   </div>
  </section>
  <section class="bc-mg-section" aria-labelledby="bcMgGamesTitle">
   <h3 class="bc-mg-section-title" id="bcMgGamesTitle">🎮 Games &amp; Activities</h3>
   <div class="bc-mg-list">
    <button class="bc-mg-entry" type="button" data-game="blacktide"><span class="bc-mg-icon">⚓</span><span><strong>Blacktide</strong><small>Pirate frontier · sail, trade, and encounter NPC ships</small></span></button>
    <button class="bc-mg-entry" type="button" data-game="fishing"><span class="bc-mg-icon">🎣</span><span><strong>Fishing</strong><small>Explore to the water and use the fishing interface</small></span></button>
    <button class="bc-mg-entry" type="button" data-game="wilds"><span class="bc-mg-icon">🌲</span><span><strong>The Wilds</strong><small>Explore the wilderness and discover its creatures</small></span></button>
    <button class="bc-mg-entry" type="button" data-game="city"><span class="bc-mg-icon">🔥</span><span><strong>BURN City</strong><small>Return to the live 3D city world</small></span></button>
   </div>
   <p class="bc-mg-foot">Movement shortcuts remain available on the main screen. This menu is the complete directory for travel and play.</p>
  </section>
 </section>`;
document.body.append(wrap,panel);
const opener=wrap.querySelector('#bcMoveGamesOpen');
const closeButton=panel.querySelector('.bc-mg-close');
const close=()=>{panel.classList.remove('on');opener.setAttribute('aria-expanded','false');opener.focus()};
const open=()=>{panel.classList.add('on');opener.setAttribute('aria-expanded','true');closeButton.focus()};
opener.addEventListener('click',()=>panel.classList.contains('on')?close():open());
closeButton.addEventListener('click',close);
panel.addEventListener('click',e=>{
 if(e.target===panel){close();return}
 const move=e.target.closest('[data-move]');
 const game=e.target.closest('[data-game]');
 if(move){
  const key=move.dataset.move;
  if(key==='fly'){if(window.__setBurnMode)window.__setBurnMode('fly');close();return}
  if(key==='boat'){
   if(window.__setBurnMode)window.__setBurnMode('explore');
   close();
   const h=document.querySelector('#help');if(h)h.textContent='Lake boat: head to the lake dock and press E near the boat to interact.';
   return;
  }
  if(key==='tour'){document.querySelector('#tour')?.click();close();return}
  document.querySelector('[data-m="'+key+'"]')?.click();close();return;
 }
 if(game){
  const key=game.dataset.game;
  if(key==='blacktide'){
   if(document.body.classList.contains('wl-travel'))return;
   close();
   if(typeof window.__launchBlacktide==='function')window.__launchBlacktide();
   else window.location.href='blacktide/';
   return;
  }
  if(key==='city'){close();if(window.__setBurnMode)window.__setBurnMode('orbit');return}
  if(key==='fishing'||key==='wilds'){
   if(window.__setBurnMode)window.__setBurnMode('explore');
   close();
   const h=document.querySelector('#help');
   if(h)h.textContent=key==='fishing'?'Fishing: travel to the water and use the fishing controls when the fishing spot is available.':'The Wilds: enter the wilderness from the city world and explore for wildlife and hostile creatures.';
  }
 }
});
document.addEventListener('pointerdown',e=>{if(panel.classList.contains('on')&&!panel.contains(e.target)&&!wrap.contains(e.target))close()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&panel.classList.contains('on'))close()});
