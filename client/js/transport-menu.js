// Transport menu: keeps travel options distinct from camera/view modes.
const css = document.createElement('style');
css.textContent = `
#bcTransportWrap{position:fixed;top:12px;right:calc(12px + 108px);z-index:68}
#bcTransportOpen{min-height:44px;padding:0 14px;border:1px solid rgba(98,228,255,.45);border-radius:11px;background:rgba(8,17,25,.94);color:#eafaff;font:700 13px monospace;cursor:pointer;box-shadow:0 4px 18px #0006}
#bcTransportOpen:hover{background:#12303a;border-color:#62e4ff}
#bcTransportMenu{display:none;position:absolute;top:50px;right:0;width:min(300px,calc(100vw - 24px));padding:10px;border:1px solid rgba(98,228,255,.35);border-radius:14px;background:rgba(8,12,18,.97);box-shadow:0 14px 40px #000a;color:#eefaff}
#bcTransportMenu.on{display:grid;gap:8px}
#bcTransportMenu button{width:100%;min-height:48px;padding:9px 11px;border:1px solid #ffffff20;border-radius:9px;background:#ffffff09;color:#fff;text-align:left;cursor:pointer}
#bcTransportMenu button:hover{background:#12303a;border-color:#62e4ff}
#bcTransportMenu strong{display:block;font-size:13px}
#bcTransportMenu small{display:block;margin-top:3px;color:#a8bdc8;font-size:11px;line-height:1.35}
#bcTransportMenu .bc-transport-note{margin:3px 5px 6px;color:#a8bdc8;font:11px/1.45 system-ui}
@media(max-width:520px){#bcTransportWrap{top:calc(10px + env(safe-area-inset-top));right:calc(10px + 82px)}#bcTransportOpen{padding:0 10px}}
`;
document.head.appendChild(css);
const wrap=document.createElement('div');wrap.id='bcTransportWrap';
wrap.innerHTML='<button id="bcTransportOpen" type="button" aria-haspopup="true" aria-expanded="false">⇄ Transport ▾</button><div id="bcTransportMenu" role="menu" aria-label="Transport options"><button type="button" data-transport="fly" role="menuitem"><strong>✈ Flight</strong><small>Move freely above the city · WASD, Space up, C down</small></button><button type="button" data-transport="boat" role="menuitem"><strong>⛵ Lake boat</strong><small>At the lake dock, use E near the boat to board or interact</small></button><p class="bc-transport-note">Transport options are separate from Orbit, Explore, and Tour.</p></div>';
document.body.appendChild(wrap);
const opener=wrap.querySelector('#bcTransportOpen'),menu=wrap.querySelector('#bcTransportMenu');
const close=()=>{menu.classList.remove('on');opener.setAttribute('aria-expanded','false')};
opener.addEventListener('click',()=>{const on=menu.classList.toggle('on');opener.setAttribute('aria-expanded',String(on))});
menu.addEventListener('click',e=>{
 const b=e.target.closest('[data-transport]');if(!b)return;
 if(b.dataset.transport==='fly'){if(window.__setBurnMode)window.__setBurnMode('fly');close();return}
 if(b.dataset.transport==='boat'){
   // Route the player toward the existing lake/boat dock if its world anchor is available.
   if(window.__setBurnMode)window.__setBurnMode('explore');
   close();
   const h=document.querySelector('#help');
   if(h)h.textContent='Lake boat: head to the lake dock and press E near the boat to interact.';
 }
});
document.addEventListener('pointerdown',e=>{if(!wrap.contains(e.target))close()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
