import assert from 'node:assert/strict';

// Mirror the importer URI decoder as a small pure function so URL edge cases can
// be tested without hitting the live XRPL.to API or writing catalog files.
function decodeNftUri(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw.startsWith('ipfs://') || /^https?:\/\//i.test(raw)) return raw;
  if (!/^(?:[0-9a-f]{2})+$/i.test(raw)) return raw;
  try {
    const decoded = Buffer.from(raw, 'hex').toString('utf8');
    return decoded && !decoded.includes('\uFFFD') ? decoded.trim() : raw;
  } catch { return raw; }
}

function safeUrl(value) {
  const raw = String(value ?? '').trim();
  if (/^ipfs:\/\//i.test(raw)) return raw;
  try {
    const u = new URL(raw);
    return ['https:', 'http:'].includes(u.protocol) ? u.toString() : '';
  } catch { return ''; }
}

const hex = value => Buffer.from(value, 'utf8').toString('hex').toUpperCase();

assert.equal(decodeNftUri('https://example.com/metadata.json'), 'https://example.com/metadata.json');
assert.equal(decodeNftUri('ipfs://bafybeigdyr/example.json'), 'ipfs://bafybeigdyr/example.json');
assert.equal(decodeNftUri(hex('https://example.com/metadata.json')), 'https://example.com/metadata.json');
assert.equal(decodeNftUri(hex('ipfs://bafybeigdyr/example.json')), 'ipfs://bafybeigdyr/example.json');
assert.equal(decodeNftUri('0xz1'), '0xz1');
assert.equal(decodeNftUri(''), '');
assert.equal(decodeNftUri('javascript:alert(1)'), 'javascript:alert(1)');
assert.equal(safeUrl(decodeNftUri(hex('https://example.com/metadata.json'))), 'https://example.com/metadata.json');
assert.equal(safeUrl(decodeNftUri(hex('javascript:alert(1)'))), '');
assert.equal(safeUrl('file:///etc/passwd'), '');
assert.equal(safeUrl('data:text/html,hello'), '');
assert.equal(safeUrl('ipfs://bafybeigdyr/example.json'), 'ipfs://bafybeigdyr/example.json');

console.log('NFT URI decoder tests passed (12 assertions).');
