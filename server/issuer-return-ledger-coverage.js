'use strict';
// Interpret rippled server_info complete_ledgers without treating successful RPC as archive proof.
function parseLedgerRanges(value) {
  if (typeof value !== 'string') return [];
  const ranges=[];
  for (const part of value.split(',')) {
    const m=/^\s*(\d+)(?:-(\d+))?\s*$/.exec(part);
    if (!m) return [];
    const start=Number(m[1]), end=Number(m[2] ?? m[1]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start>end) return [];
    ranges.push([start,end]);
  }
  return ranges.sort((a,b)=>a[0]-b[0]);
}
function coversLedgerRange(ranges, from, to) {
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from>to || from<0) return false;
  let next=from;
  for (const [start,end] of ranges) {
    if (end<next) continue;
    if (start>next) return false;
    next=Math.max(next,end+1);
    if (next>to) return true;
  }
  return false;
}
function assessServerLedgerCoverage(info, from, to) {
  const src=info?.info || info?.result?.info || info;
  const raw=src?.complete_ledgers;
  const ranges=parseLedgerRanges(raw);
  return { complete_ledgers:typeof raw==='string'?raw:null, available:coversLedgerRange(ranges,from,to),
    from_ledger:from,to_ledger:to, caveat:'Snapshot of one server only; not proof of launch supply or full issuance history' };
}
module.exports={parseLedgerRanges,coversLedgerRange,assessServerLedgerCoverage};
