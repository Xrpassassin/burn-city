// First-visit guide + music player (own tracks streamed on play; Apple Music/Audius links). No autoplay, nothing preloaded.
const $=id=>document.getElementById(id);
const btns=$('btns');
const mk=(id,txt,label)=>{const b=document.createElement('button');b.id=id;b.textContent=txt;b.setAttribute('aria-label',label);b.title=label;btns.appendChild(b);return b};
const helpB=mk('guideBtn','?','How to read the city'),musB=mk('musicBtn','♪','BURN music');
const playB=mk('playBtn','🎮 Play','Play the free multiplayer arena'),socB=mk('socialBtn','💬 Social','Burn City Social');playB.onclick=()=>location.href='arena/';socB.onclick=()=>location.href='social/';

// ---------- guide ----------
const STEPS=[
 ['🏙️','Towers are tokens','<b>Height</b> = market cap in XRP (circulating supply × AMM price, log scale). <b>Base width</b> = pool liquidity (TVL). Tap any tower for its card.'],
 ['🏗️','Build quality = locked liquidity','Rough scaffolding and blinking work lights = little LP locked (under construction). Glass, chrome trims, crown spires and a landing pad = most LP permanently locked.'],
 ['🔥','Come back daily','Tap the 🔥 chip: visit-day streak (rewards at 7 and 30 days), a free daily zombie challenge with its own leaderboard, 5 hidden BURN coins each week, and a shareable postcard.'],
 ['🎣','Lake life','Walk to the dock on the lake: fish (cast, wait for the bite, reel in the green zone), sell your catch at Tackle & Bait for lake coins (free game score, no real value) and upgrade rods and bait. Boats reach deep-water fish.'],
 ['🌀','Energy spirals','The helix winding up each tower: spin speed = 24h volume, colour = 24h price (teal up, orange-red down, blue-white flat), thickness & glow = % LP locked, number of turns = active wallets, drifting sparks = burns over 10 XRP.'],
 ['🌉','Bridges are AMM pools','<b style="color:#3cf3ff">Solid cyan road</b> = LP locked in blackholed wallets; <b style="color:#ffc64a">gold Forever Rails</b>: longer/thicker = more XRP locked forever (new deposits never shrink them), brighter = higher locked %; ∞ FOREVER plaque at ≥10k XRP blackholed. <b style="color:#ffb000">Amber rails</b> = 30–70% locked. <b style="color:#ff3b2f">Red flicker</b> = under 30%.'],
 ['🔥','Flames are burns','Every burn (tokens sent back to the issuer) leaves a permanent flame on its tower. Bigger burns = bigger flames, more burns = more of them. BURN burns orange-gold, IMM blue plasma, XRPyro white-hot. Live burns streak in as fireballs.'],
 ['🚧','Launchpad','Construction lots are launchpad tokens still on their bonding curve. The ring shows bonding progress; when one bonds it rises into a real tower.'],
 ['⛈️','Weather & live events','Weather follows 24h market mood. Banners show real burns, big trades and LP locks from the XRPL as they happen (DEMO tags mark tests).']];
const g=document.createElement('div');g.id='guide';g.setAttribute('role','dialog');g.setAttribute('aria-modal','true');g.setAttribute('aria-label','How to read Burn City');g.hidden=true;
g.innerHTML='<div class="gbox"><div class="gstep" aria-live="polite"></div><div class="gico"></div><h3></h3><p></p><div class="gdots"></div><div class="gnav"><button class="gskip">Skip</button><span><button class="gback">Back</button> <button class="gnext">Next</button></span></div><div class="gbar"><i></i></div><div class="gpause">Paused</div></div>';
document.body.appendChild(g);
// ~5.8 s per step (6 steps ≈ 35 s). Auto-advance pauses while the pointer hovers or a finger touches the card.
let gi=0,raf=0,el=0,last=0,paused=false,touchT=null;const STEP_MS=5800,bar=g.querySelector('.gbar i'),box=g.querySelector('.gbox');
function tick(now){if(g.hidden)return;const d=now-last;last=now;if(!paused){el+=d;if(el>=STEP_MS){if(gi<STEPS.length-1){gShow(gi+1)}else{el=STEP_MS}}}
 bar.style.width=Math.min(100,el/STEP_MS*100)+'%';raf=requestAnimationFrame(tick)}
function setPause(p){paused=p;g.classList.toggle('paused',p)}
function gShow(i){gi=Math.max(0,Math.min(STEPS.length-1,i));const [ic,h,p]=STEPS[gi];el=0;g.querySelector('.gico').textContent=ic;g.querySelector('h3').textContent=h;g.querySelector('p').innerHTML=p;
 g.querySelector('.gstep').textContent=`Step ${gi+1} of ${STEPS.length}`;
 g.querySelector('.gdots').innerHTML=STEPS.map((_,j)=>`<i class="${j===gi?'on':j<gi?'done':''}"></i>`).join('');g.querySelector('.gnext').textContent=gi===STEPS.length-1?'Got it':'Next';g.querySelector('.gback').disabled=gi===0}
function gOpen(){g.hidden=false;setPause(false);gShow(0);cancelAnimationFrame(raf);last=performance.now();raf=requestAnimationFrame(tick);g.querySelector('.gnext').focus()}
function gClose(){g.hidden=true;cancelAnimationFrame(raf);try{localStorage.setItem('bc_guide','1')}catch{}}
g.querySelector('.gskip').onclick=gClose;g.querySelector('.gnext').onclick=()=>gi<STEPS.length-1?gShow(gi+1):gClose();g.querySelector('.gback').onclick=()=>gShow(gi-1);
box.addEventListener('mouseenter',()=>setPause(true));box.addEventListener('mouseleave',()=>setPause(false));
box.addEventListener('touchstart',()=>{clearTimeout(touchT);setPause(true)},{passive:true});box.addEventListener('touchend',()=>{clearTimeout(touchT);touchT=setTimeout(()=>setPause(false),1500)},{passive:true});
g.onclick=e=>{if(e.target===g)gClose()};addEventListener('keydown',e=>{if(g.hidden)return;if(e.key==='Escape')gClose();else if(e.key==='ArrowRight')gShow(gi+1);else if(e.key==='ArrowLeft')gShow(gi-1)});
window.__guide={STEP_MS,steps:STEPS.length};
helpB.onclick=gOpen;
const Q=new URLSearchParams(location.search);
if(!localStorage.getItem('bc_guide')&&!Q.has('shot')&&!Q.has('noguide')){const w=()=>window.__ready?setTimeout(gOpen,600):setTimeout(w,300);w()}
if(Q.has('guide'))setTimeout(gOpen,300);

// ---------- music ----------
const APPLE='https://music.apple.com/us/artist/burn-xrp/6786536810',AUDIUS='https://audius.co/BURN_XRP';
const m=document.createElement('div');m.id='music';m.hidden=true;m.setAttribute('role','dialog');m.setAttribute('aria-label','BURN music');
m.innerHTML=`<button class="x" aria-label="Close">✕</button><h2>♪ BURN XRP</h2><div class="mnow">Press play</div>
<div class="mctl"><button class="mprev" aria-label="Previous track">⏮</button><button class="mplay" aria-label="Play">▶</button><button class="mnext" aria-label="Next track">⏭</button></div>
<div class="mprog"><i></i></div><ol class="mlist"></ol>
<div class="mlinks">More: <a href="${APPLE}" target="_blank" rel="noopener">Apple Music</a> · <a href="${AUDIUS}" target="_blank" rel="noopener">Audius</a></div>`;
document.body.appendChild(m);
let PL=null,cur=0,au=null;
async function loadPL(){if(PL)return PL;try{PL=await (await fetch('music/playlist.json')).json()}catch{PL=[]}
 m.querySelector('.mlist').innerHTML=PL.map((t,i)=>`<li><button data-i="${i}">${t.title.replace(/[<&]/g,'')}</button></li>`).join('');
 m.querySelectorAll('.mlist button').forEach(b=>b.onclick=()=>play(+b.dataset.i));return PL}
function ui(){const on=au&&!au.paused;m.querySelector('.mplay').textContent=on?'❚❚':'▶';m.querySelector('.mplay').setAttribute('aria-label',on?'Pause':'Play');
 musB.classList.toggle('on',!!on);if(PL&&PL[cur])m.querySelector('.mnow').textContent=(on?'Now playing: ':'')+PL[cur].title;
 m.querySelectorAll('.mlist li').forEach((li,i)=>li.classList.toggle('cur',i===cur&&!!au))}
function play(i){if(!PL||!PL.length)return;cur=(i+PL.length)%PL.length;
 if(!au){au=new Audio();au.preload='none';au.onended=()=>play(cur+1);au.onplay=au.onpause=ui;au.ontimeupdate=()=>{m.querySelector('.mprog i').style.width=(au.duration?100*au.currentTime/au.duration:0)+'%'};au.onerror=()=>{m.querySelector('.mnow').textContent='Could not load track (check connection)'}}
 au.src=PL[cur].src;au.volume=.8;au.play().catch(()=>{});ui()}
m.querySelector('.mplay').onclick=()=>{if(!au)return play(cur);au.paused?au.play().catch(()=>{}):au.pause()};
m.querySelector('.mnext').onclick=()=>play(cur+1);m.querySelector('.mprev').onclick=()=>play(au&&au.currentTime>3?cur:cur-1);
m.querySelector('.x').onclick=()=>m.hidden=true;
musB.onclick=async()=>{m.hidden=!m.hidden;if(!m.hidden){await loadPL();ui()}};
if('mediaSession' in navigator){navigator.mediaSession.setActionHandler('nexttrack',()=>play(cur+1));navigator.mediaSession.setActionHandler('previoustrack',()=>play(cur-1))}
