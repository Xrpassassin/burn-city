import assert from 'node:assert/strict';
import fs from 'node:fs';
const city = fs.readFileSync(new URL('./city.js', import.meta.url), 'utf8');
const avatar = fs.readFileSync(new URL('./nftchar.js', import.meta.url), 'utf8');
assert.match(city, /myNft=buildNftChar\(n,\{srv:SRV,card:true,lite:/, 'local NFT uses floating portrait');
assert.match(city, /p\.nc=buildNftChar\(n,\{srv:SRV,card:true,lite:/, 'peer NFT retains floating portrait');
assert.match(avatar, /if\(url&&opts\.card\)/, 'portrait remains optional for other game contexts');
assert.match(avatar, /new THREE\.Sprite\(/, 'portrait uses lightweight camera-facing sprite');
console.log('NFT portrait wiring checks passed');
