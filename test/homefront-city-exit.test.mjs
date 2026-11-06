import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const hud = readFileSync('client/arena/homefront-hud.mjs', 'utf8');
const cityLink = hud.match(/const city = el\('a', \{ href: '([^']+)', textContent: 'Return to BURN City' \}\)/);
assert(cityLink, 'fullscreen field menu keeps an accessible city exit');
for (const [homefront, expected] of [
  ['https://xrpassassin.github.io/burn-city/arena/homefront.html', 'https://xrpassassin.github.io/burn-city/'],
  ['https://burn-city-game.fly.dev/arena/homefront.html', 'https://burn-city-game.fly.dev/']
]) {
  assert.equal(new URL(cityLink[1], homefront).href, expected, 'exit respects the application base path');
}
const html = readFileSync('client/arena/homefront.html', 'utf8');
const handler = html.match(/\$\('back'\)\.onclick=([^\n]+);/);
assert(handler, 'classic/opening screen has the same exit');
const back = {};
const location = {};
vm.runInNewContext("$('back').onclick=" + handler[1] + ';', { $: () => back, location });
back.onclick();
assert.equal(location.href, '../');
console.log('Homefront city exits preserve hosted subpath and classic navigation');
