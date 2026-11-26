// Update the generated citizen rows while preserving the credits for other systems.
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../../client/', import.meta.url);
const { models } = JSON.parse(readFileSync(new URL('assets/citizens/models.json', root)));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rows = models.map(m => `<li><a href="${esc(m.url)}" target="_blank" rel="noopener">"${esc(m.title)}"</a> by <a href="${esc(m.artistUrl)}" target="_blank" rel="noopener">${esc(m.artist)}</a>, licensed under <a href="http://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a></li>`).join('\n');
const file = new URL('city-credits.html', root);
const page = readFileSync(file, 'utf8');
const heading = page.indexOf('<h2>City citizens (3D people)</h2>');
const start = page.indexOf('<ul>', heading);
const end = page.indexOf('</ul>', start);
if (heading < 0 || start < 0 || end < 0) throw new Error('City citizen credits list is missing');
writeFileSync(file, page.slice(0, start + 4) + '\n' + rows + '\n' + page.slice(end));
console.log('city-credits.html:', models.length, 'citizen models');
