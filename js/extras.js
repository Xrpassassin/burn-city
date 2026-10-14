// First-visit guide + music player (own tracks streamed on play; Apple Music/Audius links). No autoplay, nothing preloaded.
const $=id=>document.getElementById(id);
const btns=$('btns');
const mk=(id,txt,label)=>{const b=document.createElement('button');b.id=id;b.textContent=txt;b.setAttribute('aria-label',label);b.title=label;btns.appendChild(b);return b};
const helpB=mk('guideBtn','?','How to read the city'),musB=mk('musicBtn','♪','BURN music');

// ---------- guide ----------
const STEPS=[
 ['🏙️','Towers are tokens','<b>Height</b> = market cap in XRP (circulating supply × AMM price, log scale). <b>Base width</b> = pool liquidity (TVL). Tap any tower for its card.'],
 ['🏗️','Build quality = locked liquidity','Rough scaffolding and blinking work lights = little LP locked (under construction). Glass, chrome trims, crown spires and a landing pad = most LP permanently locked.'],
 ['🌉','Bridges are AMM pools','<b style="color:#3cf3ff">Solid cyan road</b> = LP locked in blackholed wallets. <b style="color:#ffb000">Amber rails</b> = 30–70% locked. <b style="color:#ff3b2f">Red flicker</b> = under 30%.'],
 ['🔥','Flames are burns','Every burn (tokens sent back to the issuer) leaves a permanent flame on its tower. More burns = more, hotter flames. BURN burns orange, IMM ice-blue, XRPyro red-hot.'],
 ['🚧','Launchpad','Construction lots are launchpad tokens still on their bonding curve. The ring shows bonding progress; when one bonds it rises into a real tower.'],
 ['⛈️','Weather & live events','Weather follows 24h market mood. Banners show real burns, big trades and LP locks from the XRPL as they happen (DEMO tags mark tests).']];
const g=document.createElement('div');g.id='guide';g.setAttribute('role','dialog');g.setAttribute('aria-modal','true');g.setAttribute('aria-label','How to read Burn City');g.hidden=true;
g.innerHTML='<div class="gbox"><div class="gico"></div><h3></h3><p></p><div class="gdots"></div><div class="gnav"><button class="gskip">Skip</button><button class="gnext">Next</button></div><div class="gbar"><i></i></div></div>';
document.body.appendChild(g);
let gi=0,gt=null;const STEP_MS=2600;
function gShow(i){gi=i;const [ic,h,p]=STEPS[i];g.querySelector('.gico').textContent=ic;g.querySelector('h3').textContent=h;g.querySelector('p').innerHTML=p;
 g.querySelector('.gdots').innerHTML=STEPS.map((_,j)=>`<i class="${j===i?'on':''}"></i>`).join('');g.querySelector('.gnext').textContent=i===STEPS.length-1?'Got it':'Next';
 const bar=g.querySelector('.gbar i');bar.style.transition='none';bar.style.width='0';void bar.offsetWidth;bar.style.transition=`width ${STEP_MS}ms linear`;bar.style.width='100%';
 clearTimeout(gt);gt=setTimeout(()=>i<STEPS.length-1?gShow(i+1):null,STEP_MS)}
function gOpen(){g.hidden=false;gShow(0);g.querySelector('.gnext').focus()}
function gClose(){g.hidden=true;clearTimeout(gt);try{localStorage.setItem('bc_guide','1')}catch{}}
g.querySelector('.gskip').onclick=gClose;g.querySelector('.gnext').onclick=()=>gi<STEPS.length-1?gShow(gi+1):gClose();
g.onclick=e=>{if(e.target===g)gClose()};addEventListener('keydown',e=>{if(!g.hidden&&e.key==='Escape')gClose()});
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
