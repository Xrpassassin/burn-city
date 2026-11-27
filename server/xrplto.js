// Shared xrpl.to request headers. With XRPLTO_API_KEY set (Fly secret), every api.xrpl.to call sends `X-Api-Key`
// (free key: 10 req/s, 1M credits/month); unset = anonymous (30/min, 333/day per IP, shared by eco.js, nft.js and memes-circle.js).
// The key is read per call (so a restart with the secret picks it up) and is never logged or returned: callers expose only keyed().
'use strict';
const key = () => String(process.env.XRPLTO_API_KEY || '').trim();
const keyed = () => key().length > 0;
function headers(extra = {}) { const k = key(); return k ? { ...extra, 'X-Api-Key': k } : { ...extra }; }
module.exports = { headers, keyed };
