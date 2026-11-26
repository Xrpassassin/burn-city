// Client-only Mortuus-like presentation for the original Zombies mode:
// round banner, remaining count, low-health vignette, hit shake, points pop,
// and a between-round clear card. Does not change server combat, lobby or payments.
const CSS=`
#roundBan{position:fixed;left:50%;top:18%;transform:translate(-50%,-12px) scale(.96);z-index:8;pointer-events:none;font:800 42px/1 system-ui;letter-spacing:.18em;color:#ffe7c2;text-shadow:0 0 18px #ff6a00,0 2px 0 #000,0 0 4px #000;opacity:0;transition:opacity .35s,transform .45s}
#roundBan.on{opacity:1;transform:translate(-50%,0) scale(1)}
#roundBan small{display:block;margin-top:8px;font:700 13px/1.2 system-ui;letter-spacing:.28em;color:#ffb070;text-shadow:0 0 8px #000}
#waveClear{position:fixed;left:50%;top:12%;transform:translateX(-50%);z-index:7;pointer-events:none;min-width:220px;padding:12px 18px;border:1px solid #ff9a4066;border-radius:12px;background:#0a0808e8;color:#f4e6d4;font:14px/1.45 system-ui;text-align:center;opacity:0;transition:opacity .3s}
#waveClear.on{opacity:1}
#waveClear b{display:block;color:#ffe08a;font-size:16px;letter-spacing:.12em;margin-bottom:4px}
#ptsPop{position:fixed;left:50%;top:calc(50% + 28px);transform:translate(-50%,0);z-index:62;pointer-events:none;font:800 18px system-ui;color:#ffe08a;text-shadow:0 0 6px #000;opacity:0;transition:opacity .35s,transform .35s}
#ptsPop.on{opacity:1;transform:translate(-50%,-16px)}
@media (pointer:coarse){#roundBan{font-size:28px;top:22%}#waveClear{top:16%;font-size:13px}}
`;

function el(id,css){
 let n=document.getElementById(id);
 if(!n){n=document.createElement('div');n.id=id;if(css)n.style.cssText=css;document.body.appendChild(n);}
 return n;
}

export function createMortuusFeel(){
 if(!document.getElementById('mortuusFeelCss')){
  const s=document.createElement('style');s.id='mortuusFeelCss';s.textContent=CSS;document.head.appendChild(s);
 }
 const ban=el('roundBan'),card=el('waveClear'),pop=el('ptsPop');
 let shake=0,flash=0,lastPts=null,waveKills=0,hadLeft=0,clearT=0,banT=0,popT=0;
 return {
  reset(){
   shake=flash=waveKills=hadLeft=clearT=banT=popT=0;lastPts=null;
   ban.className=card.className=pop.className='';
   const hurt=document.getElementById('hurt');if(hurt)hurt.style.opacity=0;
  },
  onWave(n){
   banT=2.4;ban.innerHTML=`ROUND ${n}<small>THEY KEEP COMING</small>`;ban.className='on';
   card.className='';clearT=0;waveKills=0;
  },
  onKill(){waveKills++;shake=Math.min(1,shake+0.18);},
  onHit(e){shake=Math.min(1,shake+(e?.k?0.28:0.1));},
  onHurt(){flash=1;shake=Math.min(1,shake+0.35);},
  popPts(n){
   if(!n)return;popT=0.7;pop.textContent=`+${n}`;pop.className='on';
  },
  onCleared({wave,pts,kills,score}){
   if(!(wave>0))return;
   clearT=3.2;
   card.innerHTML=`<b>ROUND ${wave} CLEARED</b>Score ${score??0} · ${kills??0} kills this round<br>${pts??0} pts in pocket`;
   card.className='on';
  },
  tick(dt,st){
   if(banT>0){banT-=dt;if(banT<=0)ban.className='';}
   if(clearT>0){clearT-=dt;if(clearT<=0)card.className='';}
   if(popT>0){popT-=dt;if(popT<=0)pop.className='';}
   shake=Math.max(0,shake-dt*2.8);
   flash=Math.max(0,flash-dt*2.2);
   const hp=st?.hp??0,max=st?.maxHp||100,alive=!!st?.alive,down=!!st?.down;
   const ratio=max>0?hp/max:1;
   const hurt=document.getElementById('hurt');
   if(hurt){
    const low=alive&&!down&&ratio<0.4?(0.4-ratio)/0.4*0.72:0;
    const downOp=down?0.55:0;
    hurt.style.transition='opacity .18s';
    hurt.style.opacity=Math.min(0.9,Math.max(low,downOp,flash*0.8));
   }
   const pts=st?.pts;
   if(lastPts!=null&&Number.isFinite(pts)&&pts>lastPts)this.popPts(pts-lastPts);
   lastPts=Number.isFinite(pts)?pts:lastPts;
   const left=st?.left;
   if(hadLeft>0&&left===0&&(st?.wave||0)>0)this.onCleared({wave:st.wave,pts:st.pts,kills:waveKills,score:st.score});
   if(Number.isFinite(left))hadLeft=left;
   return shake;
  },
  // Offset applied after the first-person camera is placed.
  camJitter(now=performance.now()){
   if(shake<=0.002)return {x:0,y:0,rx:0,rz:0};
   const a=now*0.07,k=shake*0.038;
   return {x:Math.sin(a*1.7)*k,y:Math.cos(a*2.1)*k*0.6,rx:Math.sin(a*2.4)*k*0.35,rz:Math.cos(a*1.9)*k*0.28};
  },
  get waveKills(){return waveKills;}
 };
}
