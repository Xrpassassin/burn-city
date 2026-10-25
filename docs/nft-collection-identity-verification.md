# NFT Collection Identity Verification Runbook

## Purpose

This runbook is the required gate before enabling bulk ingestion for RACC, 589 Protocol, or Firekeepers. A display name or collection slug is not a cryptographic identity. Do not populate `client/js/nft-collection-ingest-plan.json` from memory, search snippets, or a similarly named collection.

## Required identity tuple

Record and independently verify all of the following for each collection:

- **Canonical collection name** and marketplace page.
- **API slug** accepted by the documented XRPL.to collection endpoint.
- **Issuer account** (the exact XRPL classic address).
- **NFToken taxon** as an integer.
- **Expected inventory count** from the collection endpoint, including the timestamp and response field used.
- **At least two sample NFTokenIDs** returned by the inventory endpoint, each checked against the expected issuer and taxon.
- **Source evidence**: direct endpoint/page URLs and a saved, redacted response excerpt or review note. Do not store wallet secrets or credentials.

## Verification sequence

1. Find the intended collection's canonical marketplace page and record its exact URL.
2. Query the documented collection discovery/detail endpoint. Confirm the returned slug and display name match the intended collection, not just a similar name.
3. Read issuer and taxon from the collection detail response. Compare the issuer to the classic address shown by the canonical marketplace collection page or other authoritative project source.
4. Query the NFT inventory endpoint using that issuer and taxon. Verify at least two distinct records have the exact issuer/taxon pair and valid 64-hex `NFTokenID` values.
5. Compare the API's collection count with the observed unique inventory count. Explain any discrepancy before proceeding; do not quietly change the expected count just to make the import pass.
6. Have a second reviewer confirm the identity tuple and source evidence.
7. Only then populate the collection config fields and change the status from `needs-identity-verification` to a reviewed status. Keep the PR unmerged until focused tests and a dry run have been reviewed.

## Acceptance checklist

A collection is not approved until every item is checked:

- [ ] Canonical marketplace URL recorded.
- [ ] API slug confirmed by direct endpoint response.
- [ ] Issuer confirmed from an authoritative source and matches API.
- [ ] Taxon confirmed and matches sample inventory records.
- [ ] Expected count source and retrieval time recorded.
- [ ] Two or more sample token IDs validated.
- [ ] Inventory count discrepancies resolved.
- [ ] Second reviewer recorded.
- [ ] Dry-run output reviewed; completeness and errors understood.
- [ ] Artwork and metadata rights remain separately unverified until individually reviewed.

## Fail-closed rules

- Missing, ambiguous, or conflicting identity fields mean **do not ingest**.
- A complete inventory is not proof that metadata or artwork is accurate, safe to render, or licensed for reuse.
- The importer must preserve source provenance and raw metadata while avoiding automatic artwork rehosting.
- Rights approval and visual approval are separate gates; neither may be inferred from collection identity.
- Do not use a collection count from a search result or marketplace display as a substitute for verifying the configured API response.

## Current state

The three configured collections intentionally remain `needs-identity-verification`, with slug, issuer, taxon, and expected count unset. This is a safety gate, not a setup failure.
