'use strict';
// Reuse the existing Xaman session. Never ask players to paste bearer tokens.
import('./js/estate-portfolio-ui.mjs').then(({mountEstatePortfolio})=>{
 window.__estatePortfolio=mountEstatePortfolio();
 const signInButton=document.getElementById('estates-xaman-signin');
 if(signInButton){
  const update=()=>{signInButton.textContent=localStorage.getItem('bcToken')?'Switch Xaman wallet':'Sign in to purchase property';};
  update();
  signInButton.addEventListener('click',async()=>{
   signInButton.disabled=true;
   try{
    const {openEstateXamanSignIn}=await import('./js/estates-xaman-signin.mjs');
    const api=/localhost|127[.]0[.]0[.]1|fly[.]dev$/.test(location.hostname)?location.origin:'https://burn-city-game.fly.dev';
    await openEstateXamanSignIn({api,opener:signInButton,onAuthenticated:()=>{
     update();
     return window.__estatePortfolio?.refresh();
    }});
   }catch(error){
    if(error?.code!=='sign_in_cancelled')document.getElementById('session-status').textContent=error.message||'Could not connect Xaman.';
   }finally{signInButton.disabled=false;update();}
  });
 }

}).catch(()=>{
 document.getElementById('live-status').textContent='Estates could not load. Please refresh the page.';
 document.getElementById('owned-properties').textContent='Portfolio unavailable.';
});
