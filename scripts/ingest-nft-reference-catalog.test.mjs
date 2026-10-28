import assert from 'node:assert/strict';
import { decodeNftUri, safeUrl } from './nft-uri-utils.mjs';

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
