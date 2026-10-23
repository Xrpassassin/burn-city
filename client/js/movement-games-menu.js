// Unified Movement & Games hub.
// Replaces the separate Transport and Play popovers with one accessible, mobile-safe breakdown.
const style = document.createElement('style');
style.textContent = `
/* the opener lives in the #btns toolbar (before 🎮 Play / ⋯), so it never covers them; #bcMoveGamesWrap is only a fallback when #btns is missing */
#bcMoveGamesWrap{position:fixed;top:calc(env(safe-area-inset-top,0px) + 12px);right:calc(env(safe-area-inset-right,0px) + 12px);z-index:68}
#btns #bcMoveGamesOpen{background:rgba(12,10,13,.94);border:1px solid rgba(255,145,65,.6)}
#bcMoveGamesOpen .bc-mg-short{display:none}
#bcMoveGamesOpen{min-height:44px;padding:0 14px;border:1px solid rgba(255,145,65,.6);border-radius:11px;background:rgba(12,10,13,.94);color:#fff;font:700 13px/1 var(--f-mono,monospace);box-shadow:0 4px 18px #0007;white-space:nowrap}
#bcMoveGamesOpen .bc-mg-mark{color:#ff9b4a;margin-right:7px}
#bcMoveGamesPanel{position:fixed;inset:0;z-index:120;display:none;align-items:flex-start;justify-content:flex-end;padding:calc(env(safe-area-inset-top,0px) + 68px) calc(env(safe-area-inset-right,0px) + 12px) calc(env(safe-area-inset-bottom,0px) + 16px) calc(env(safe-area-inset-left,0px) + 12px);background:rgba(0,0,0,.34)}
#bcMoveGamesPanel.on{display:flex}
#bcMoveGamesPanel .bc-mg-card{width:min(420px,100%);max-height:calc(100dvh - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px) - 100px);overflow:auto;overscroll-behavior:contain;border:1px solid rgba(255,145,65,.42);border-radius:16px;background:rgba(11,11,17,.98);color:#f6efe9;box-shadow:0 18px 60px #000b;padding:16px}
#bcMoveGamesPanel .bc-mg-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}
#bcMoveGamesPanel h2{font:800 18px/1.25 var(--f-mono,monospace);margin:0;color:#ffb16a}
#bcMoveGamesPanel .bc-mg-sub{margin:5px 0 0;color:#b9b2b0;font:12px/1.45 var(--f-ui,system-ui)}
#bcMoveGamesPanel .bc-mg-close{width:44px;min-width:44px;height:44px;padding:0;border-radius:50%;font-size:19px}
#bcMoveGamesPanel .bc-mg-lock{display:none;margin:12px 0 0;padding:10px 12px;border:1px solid #7dffb055;border-radius:11px;background:#7dffb00f;color:#d9f7e4;font:12px/1.45 var(--f-ui,system-ui)}
body.wl-travel #bcMoveGamesPanel .bc-mg-lock{display:block}
body.wl-travel #bcMoveGamesPanel [data-move=orbit],body.wl-travel #bcMoveGamesPanel [data-move=fly],body.wl-travel #bcMoveGamesPanel [data-move=tour],body.wl-travel #bcMoveGamesPanel [data-move=boat],body.wl-travel #bcMoveGamesPanel [data-game]:not([data-game=arena]){display:none!important}
#bcMoveGamesPanel.no-wilds [data-game=wilds]{display:none}
#bcMoveGamesPanel .bc-mg-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 12px}
#bcMoveGamesPanel .bc-mg-tab{min-height:44px;border:1px solid #ffffff24;border-radius:10px;background:#ffffff08;color:#c8c0bc;font:800 12px/1.2 var(--f-mono,monospace)}
#bcMoveGamesPanel .bc-mg-tab[aria-selected=true]{background:#ff7a1a20;border-color:#ff9b4a;color:#ffbd84;box-shadow:inset 0 -2px #ff9b4a}
#bcMoveGamesPanel .bc-mg-section{margin-top:14px}
#bcMoveGamesPanel .bc-mg-section[hidden]{display:none!important}
#btns button[data-m=orbit],#btns button[data-m=explore],#btns .seg{display:none!important}
#bcMoveGamesPanel .bc-mg-section-title{display:flex;align-items:center;gap:8px;margin:0 0 8px;color:#e7d9d0;font:800 11px/1.2 var(--f-mono,monospace);letter-spacing:.12em;text-transform:uppercase}
#bcMoveGamesPanel .bc-mg-list{display:grid;grid-template-columns:1fr 1fr;gap:8px}
#bcMoveGamesPanel .bc-mg-entry{display:flex;align-items:flex-start;gap:10px;min-height:72px;width:100%;padding:11px;border:1px solid #ffffff1c;border-radius:11px;background:#ffffff08;color:#fff;text-align:left}
#bcMoveGamesPanel .bc-mg-entry:hover{background:#ff7a1a18;border-color:#ff9a4a99}
#bcMoveGamesPanel .bc-mg-icon{width:26px;flex:0 0 26px;text-align:center;font-size:21px;line-height:1.25}
#bcMoveGamesPanel .bc-mg-entry strong{display:block;font-size:13px;line-height:1.3}
#bcMoveGamesPanel .bc-mg-entry small{display:block;margin-top:4px;color:#b9b2b0;font:11px/1.4 var(--f-ui,system-ui)}
#bcMoveGamesPanel .bc-mg-foot{margin:12px 2px 0;color:#89888f;font:11px/1.45 var(--f-ui,system-ui)}
@media(max-width:520px){
 #bcMoveGamesWrap{right:calc(env(safe-area-inset-right,0px) + 10px);top:calc(env(safe-area-inset-top,0px) + 10px)}
 #bcMoveGamesOpen{min-width:44px;padding:0 10px;font-size:12px}
 #bcMoveGamesPanel{padding:calc(env(safe-area-inset-top,0px) + 62px) calc(env(safe-area-inset-right,0px) + 10px) calc(env(safe-area-inset-bottom,0px) + 10px) calc(env(safe-area-inset-left,0px) + 10px)}
 #bcMoveGamesPanel .bc-mg-card{padding:13px;max-height:calc(100dvh - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px) - 84px)}
 #bcMoveGamesPanel .bc-mg-list{grid-template-columns:1fr}
 #bcMoveGamesPanel .bc-mg-entry{min-height:60px}
}
/* phones (narrow portrait or short landscape): no room for the full label and both Play buttons beside ✕ Exit / ☰ View, so the opener reads ⇄ Play ▾ and the arena moves into the hub (Multiplayer arena entry) */
@media(max-width:520px),(max-height:500px){#bcMoveGamesOpen .bc-mg-long{display:none}#bcMoveGamesOpen .bc-mg-short{display:inline}#btns #playBtn{display:none!important}}
@media(min-width:521px){#bcMoveGamesPanel{padding-right:calc(env(safe-area-inset-right,0px) + 12px)}}
`;
document.head.appendChild(style);

const wrap = document.createElement('div');
wrap.id = 'bcMoveGamesWrap';
wrap.innerHTML = '<button id="bcMoveGamesOpen" type="button" aria-label="Movement and games" aria-haspopup="dialog" aria-expanded="false" aria-controls="bcMoveGamesPanel"><span class="bc-mg-mark" aria-hidden="true">⇄</span><span class="bc-mg-long">Movement &amp; Games ▾</span><span class="bc-mg-short" aria-hidden="true">Play ▾</span></button>';
const panel = document.createElement('div');
panel.id = 'bcMoveGamesPanel';
panel.setAttribute('role','dialog');
panel.setAttribute('aria-modal','true');
panel.setAttribute('aria-labelledby','bcMoveGamesTitle');
panel.innerHTML = `
 <section class="bc-mg-card">
  <header class="bc-mg-head"><div><h2 id="bcMoveGamesTitle">MOVEMENT &amp; GAMES</h2><p class="bc-mg-sub">Choose how to travel or what to play. Everything in one place.</p></div><button class="bc-mg-close" type="button" aria-label="Close menu">×</button></header>
  <div class="bc-mg-tabs" role="tablist" aria-label="Menu category">
   <button class="bc-mg-tab" id="bcMgMovementTab" type="button" role="tab" aria-controls="bcMgMovement" aria-selected="true">⌁ Movement</button>
   <button class="bc-mg-tab" id="bcMgGamesTab" type="button" role="tab" aria-controls="bcMgGames" aria-selected="false">🎮 Games</button>
  </div>
  <section class="bc-mg-section" id="bcMgMovement" role="tabpanel" aria-labelledby="bcMgMovementTab">
   <h3 class="bc-mg-section-title" id="bcMgMovementTitle">⌁ Movement &amp; View</h3>
   <div class="bc-mg-list">
    <button class="bc-mg-entry" type="button" data-move="orbit"><span class="bc-mg-icon">◎</span><span><strong>Orbit</strong><small>Rotate around the city overview</small></span></button>
    <button class="bc-mg-entry" type="button" data-move="explore"><span class="bc-mg-icon">🚶</span><span><strong>Explore on foot</strong><small>Walk, run, jump, and interact</small></span></button>
    <button class="bc-mg-entry" type="button" data-move="tour"><span class="bc-mg-icon">▶</span><span><strong>Guided tour</strong><small>Let the city tour guide the camera</small></span></button>
    <button class="bc-mg-entry" type="button" data-move="fly"><span class="bc-mg-icon">✈️</span><span><strong>Flight</strong><small class="bc-mg-flyhint">Free-fly above the city · WASD, Space up, C down</small></span></button>
    <button class="bc-mg-entry" type="button" data-move="boat"><span class="bc-mg-icon">⛵</span><span><strong>Lake boat</strong><small class="bc-mg-boathint">Takes you to the boat dock · board with E</small></span></button>
   </div>
  </section>
  <p class="bc-mg-lock" role="note">🌲 You are in the Wilds: travel is on foot only. Walk back out through the gate for Orbit, Flight, Tour, Blacktide and the rest.</p>
  <section class="bc-mg-section bc-mg-games" id="bcMgGames" role="tabpanel" aria-labelledby="bcMgGamesTab" hidden>
   <h3 class="bc-mg-section-title" id="bcMgGamesTitle">🎮 Games &amp; Activities</h3>
   <div class="bc-mg-list">
    <button class="bc-mg-entry" type="button" data-game="blacktide"><span class="bc-mg-icon">⚓</span><span><strong>Blacktide</strong><small>Pirate frontier · sail, trade, and encounter NPC ships</small></span></button>
    <button class="bc-mg-entry" type="button" data-game="arena"><span class="bc-mg-icon">🧟</span><span><strong>Multiplayer arena</strong><small>Zombies, ranked and Tron · free to play</small></span></button>
    <button class="bc-mg-entry" type="button" data-game="fishing"><span class="bc-mg-icon">🎣</span><span><strong>Fishing</strong><small>Takes you to the end of the fishing dock · cast from there</small></span></button>
    <button class="bc-mg-entry" type="button" data-game="wilds"><span class="bc-mg-icon">🌲</span><span><strong>The Wilds</strong><small>Takes you to the forest gate north of town · on foot only inside</small></span></button>
    <button class="bc-mg-entry" type="button" data-game="city"><span class="bc-mg-icon">🔥</span><span><strong>BURN City</strong><small>Return to the live 3D city world</small></span></button>
   </div>
   <p class="bc-mg-foot">This menu is the complete directory for travel and play.</p>
  </section>
 </section>`;
const bar=document.getElementById('btns');
if(bar){const ob=wrap.firstElementChild;bar.insertBefore(ob,bar.querySelector('#playBtn,#moreBtn'));document.body.append(panel)}else document.body.append(wrap,panel);
const opener=document.getElementById('bcMoveGamesOpen');
const closeButton=panel.querySelector('.bc-mg-close');
const movementTab=panel.querySelector('#bcMgMovementTab');
const gamesTab=panel.querySelector('#bcMgGamesTab');
const movementPanel=panel.querySelector('#bcMgMovement');
const gamesPanel=panel.querySelector('#bcMgGames');
function selectTab(which,focus=false){
 const games=which==='games';
 movementTab.setAttribute('aria-selected',String(!games));
 gamesTab.setAttribute('aria-selected',String(games));
 movementPanel.hidden=games;
 gamesPanel.hidden=!games;
 movementTab.tabIndex=games?-1:0;
 gamesTab.tabIndex=games?0:-1;
 if(focus)(games?gamesTab:movementTab).focus();
}
movementTab.addEventListener('click',()=>selectTab('movement'));
gamesTab.addEventListener('click',()=>selectTab('games'));
[movementTab,gamesTab].forEach((tab,index)=>tab.addEventListener('keydown',e=>{
 if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();selectTab(index===0?'games':'movement',true)}
}));
const Q=new URLSearchParams(location.search);
if(Q.has('nowilds'))panel.classList.add('no-wilds');
const touch=()=>window.__city?!!window.__city.MOBILE:matchMedia('(pointer:coarse)').matches;
const locked=()=>!!(window.__wildsTravelLocked&&window.__wildsTravelLocked())||document.body.classList.contains('wl-travel');
// Hints go to a city toast (#help is rewritten by every mode change); #help is only a fallback before app.js is up.
const say=t=>{if(window.__bcToast)window.__bcToast(t,'#ff9b4a');else{const h=document.querySelector('#help');if(h)h.textContent=t}};
const go=k=>{if(window.__setBurnMode)window.__setBurnMode(k)};
// "Take me there": Explore at a real world spot (the same anchors boat.js / fish.js / wilds-gate.js use), facing the thing.
const spots={
 boat:()=>{const f=window.__fishWorld,b=window.__boatWorld;if(!f||!b||!b.docks||!b.docks[0])return null;const d=f.dock.dir,p=b.docks[0].base;return{x:p.x+d.x*3,z:p.z+d.z*3,face:{x:p.x+d.x*12,z:p.z+d.z*12}}},
 fishing:()=>{const f=window.__fishWorld;if(!f)return null;const d=f.dock.dir,p=f.dock.base;return{x:p.x+d.x*16,z:p.z+d.z*16,face:{x:p.x+d.x*30,z:p.z+d.z*30}}},
 wilds:async()=>{const g=(await import('./wilds-gate.js')).GATE;return{x:g.x,z:g.z-16,face:{x:g.x,z:g.z}}},
};
const MSG={
 boat:[()=>touch()?'⛵ Boat dock: walk up to a boat and tap 🚤 Board boat.':'⛵ Boat dock: walk up to a boat and press E (or click 🚤 Board boat).','⛵ Lake boat: head to the lake dock and board a boat with E / USE.'],
 fishing:[()=>touch()?'🎣 Fishing dock: tap 🎣 Fish to cast.':'🎣 Fishing dock: press F (or click 🎣 Fish) to cast.','🎣 Fishing: walk to the end of the lake dock or the shore, then cast.'],
 wilds:[()=>'🌲 The Wilds gate is just ahead: walk through it to enter the forest.','🌲 The Wilds: walk north of town to the forest gate.'],
};
async function travel(k){
 if(locked()){say('🌲 In the Wilds you travel on foot. Walk back out through the gate first.');return}
 let s=null;try{s=await spots[k]()}catch(_){}
 const ok=!!(s&&window.__walkTo&&window.__walkTo(s.x,s.z,s.face));
 if(!ok)go('explore');
 say(ok?MSG[k][0]():MSG[k][1]);
}
const close=(focus=true)=>{panel.classList.remove('on');opener.setAttribute('aria-expanded','false');if(focus)opener.focus()};
const open=()=>{
 selectTab('movement');
 const fh=panel.querySelector('.bc-mg-flyhint');if(fh)fh.textContent=touch()?'Free-fly above the city · left stick, drag to look, ▲ / ▼':'Free-fly above the city · WASD, Space up, C down';
 const bh=panel.querySelector('.bc-mg-boathint');if(bh)bh.textContent=touch()?'Takes you to the boat dock · tap 🚤 Board boat':'Takes you to the boat dock · board with E';
 panel.classList.add('on');opener.setAttribute('aria-expanded','true');closeButton.focus()};
opener.addEventListener('click',()=>panel.classList.contains('on')?close():open());
closeButton.addEventListener('click',()=>close());
panel.addEventListener('click',e=>{
 if(e.target===panel){close();return}
 const move=e.target.closest('[data-move]');
 const game=e.target.closest('[data-game]');
 if(!move&&!game)return;
 const key=move?move.dataset.move:game.dataset.game;
 close(false);   // every entry closes the panel first, even when it is refused
 if(key==='arena'){const pb=document.getElementById('playBtn');if(pb)pb.click();else location.href='arena/';return}
 if(locked()&&key!=='explore'){say('🌲 In the Wilds you travel on foot. Walk back out through the gate first.');return}
 if(key==='fly'||key==='orbit'||key==='explore'){go(key);return}
 if(key==='tour'){document.querySelector('#tour')?.click();return}
 if(key==='city'){go('orbit');return}
 if(key==='blacktide'){
  if(typeof window.__launchBlacktide==='function')window.__launchBlacktide();
  else window.location.href='blacktide/';
  return;
 }
 if(spots[key])travel(key);
});
// capture phase: Esc closes the hub without also opening the city pause menu underneath
addEventListener('keydown',e=>{if(e.key==='Escape'&&panel.classList.contains('on')){e.stopImmediatePropagation();e.preventDefault();close()}},true);
addEventListener('pageshow',()=>close(false));
if(Q.has('debug')||Q.has('hubtest'))window.__hub={open,close,travel,spots,locked};
