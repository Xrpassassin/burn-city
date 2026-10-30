'use strict';
// Reuse the existing Xaman session. Never ask players to paste bearer tokens.
import('./js/estate-portfolio-ui.mjs').then(({mountEstatePortfolio})=>{
 window.__estatePortfolio=mountEstatePortfolio();
}).catch(()=>{
 document.getElementById('live-status').textContent='Estates could not load. Please refresh the page.';
 document.getElementById('owned-properties').textContent='Portfolio unavailable.';
});
