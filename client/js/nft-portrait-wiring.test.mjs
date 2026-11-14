import assert from 'node:assert/strict';
import fs from 'node:fs';
const city = fs.readFileSync(new URL('./city.js', import.meta.url), 'utf8');
const avatar = fs.readFileSync(new URL('./nftchar.js', import.meta.url), 'utf8');
assert.match(city, /myNft=buildNftChar\(n,\{srv:SRV,card:true,lite:/, 'local NFT uses floating portrait');
assert.match(city, /p\.nc=buildNftChar\(n,\{srv:SRV,card:true,lite:/, 'peer NFT retains floating portrait');
assert.match(avatar, /if\(url&&opts\.card\)/, 'portrait remains optional for other game contexts');
assert.match(avatar, /new THREE\.Sprite\(/, 'portrait uses lightweight camera-facing sprite');
// Hiding the player's own Gas Mask Guy re-shows the primitive fallback body, so it must happen
// before those primitive parts are hidden; otherwise the old walker overlaps the NFT holder's body.
assert.match(city, /av\.add\(myNft\);av\.userData\.defaultAvatar\?\.setVisible\(false\);o\.kids\.forEach\(k=>\{if\(!k\.isLight\)k\.visible=false\}\)/, 'own NFT Gas Mask Guy hides the primitive walker after the default avatar');
assert.doesNotMatch(city, /(myNft|p\.nc)\.scale\.setScalar\(\.9\)/, 'NFT holders are full player height, like everyone else');
assert.match(city, /p\.nc\.userData\.defaultAvatar\?\.setLod\?\.\(/, 'peer NFT Gas Mask Guy switches to the far LOD');
console.log('NFT portrait wiring checks passed');
