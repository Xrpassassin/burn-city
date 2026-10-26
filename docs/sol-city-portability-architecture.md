# SOL City portability architecture — initial implementation boundary

Status: architecture only. No Solana SDK, wallet authentication, deployment, or migration has been implemented. The current BURN City server still uses its existing XRPL-specific modules. The new world profiles are not yet wired to the server entry point.

## Observed XRPL coupling
- `server/config.js`: XRPL endpoint/network, Xaman credentials, XRP drops, issuer/currency and treasury defaults.
- `server/payments.js`: Xaman sign-in, XRPL transaction construction and verification, SQLite purchases keyed by XRPL account.
- `server/nft.js`: XRPL account NFTs, issuer/taxon collection recognition, NFT token IDs and marketplace enrichment.
- Other estate, AMM, burn, treasury and UI paths need a full dependency audit before porting.

## Architecture rules
1. Keep BURN City's existing XRPL path unchanged until tests and a deliberate migration gate.
2. SOL City gets its own deployment, environment variables, persistent data, wallet sessions, chain identifiers and payment ledger. Do not copy private keys, seeds, Xaman credentials, or live databases.
3. The shared gameplay layer must not import blockchain SDKs directly. Chain-specific operations go through an injected adapter.
4. Treat wallet signatures as challenges with domain, chain, nonce, expiry and replay protection. Never accept a wallet address alone as authentication.
5. NFT ownership must be verified against the respective chain, including compressed NFT mechanisms on Solana when supported. Marketplace metadata is never proof of ownership.
6. DEX liquidity representation requires chain-specific definitions of pools, liquidity, locks, burn destinations and provenance; never translate XRPL black-hole semantics directly into Solana claims.
7. Payments, distributions and on-chain estate ownership remain disabled in the SOL profile until separate threat modeling, financial review, testing and authorization.
8. Do not promise game asset reuse across collections or chains unless licenses and creator rights permit it.
9. Separate brand/world configuration from simulation mechanics. Avoid forking core gameplay until a measured incompatibility requires it.
10. Preserve Node 22 and the existing port 8080 expectation for BURN City; a separate deployment can use the same internal port.

## Suggested staged work
- Inventory all XRPL imports, API routes, persistence keys, wallet UI, economy jobs, and estate rules.
- Extract a read-only world configuration endpoint and server-side feature gating.
- Run an isolated SOL City clone with chain-dependent routes disabled.
- Implement read-only Solana network and metadata adapters; add fixture-driven tests.
- Add wallet signature authentication with replay-protected sessions.
- Build token ownership and trait normalization, then liquidity adapters.
- Only after approval consider transaction execution and financial features.

## Acceptance gates
- Existing BURN City tests and behavior remain unchanged.
- SOL City can boot with no XRPL credentials or treasury secrets.
- SOL City cannot invoke BURN burn/payment jobs or access BURN data directories.
- Wallet identity includes chain and network; replay across worlds fails.
- A shared gameplay patch can be tested independently in both worlds.
- A failing adapter leaves gameplay functional with blockchain features disabled.
