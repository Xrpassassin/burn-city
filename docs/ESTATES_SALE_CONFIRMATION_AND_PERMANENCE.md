# Estates sale commitment and owner notifications

## Required user experience

A property owner must see a clear, explicit confirmation screen before committing an Estate to the sale process. The confirmation must name the property, display the proposed price and fees where applicable, summarize the sale action, and explain that cancellation is possible only before confirmation. The owner must affirmatively confirm; opening the screen or pressing a generic continue button is not consent.

The server records a terms hash so the confirmation applies to the exact terms shown. If price, fee, or material terms change, the prior confirmation is invalid and the owner must review again. Intents expire after a short configurable window. The owner receives a durable in-app notification when confirmation is required and a receipt when the commitment is confirmed.

## What this module does

`server/estate-sale-confirmation.js` provides a SQLite-backed intent and notification outbox. It records pending confirmation, explicit confirmation, cancellation, expiration, terms hashes, and notification delivery status. It never lists or transfers property and never initiates a payment.

The application must authenticate the account server-side and pass the authenticated XRPL account as `ownerAcct`; never trust a client-supplied account without checking the session/wallet proof. Call `markNotification` only after the selected delivery channel confirms delivery. Pending notifications need a retry worker with backoff and an idempotent delivery key.

## Permanent map presence

The intended product promise should be scoped to a persistent property identity and map slot, with published service-continuity terms, backups, migration policy, and handling for major world redesigns or shutdown. Avoid promising that the game, servers, map, or service will exist literally forever unless the project can legally and operationally honor that promise. A defensible player-facing statement is a persistent in-world place while the service operates, subject to published continuity terms.

## Financial disclosure

Property persistence and weekly AMM-funded distributions are separate features. Do not imply that property purchases entitle owners to profit or a guaranteed yield. Any distribution may be zero and depends on approved, realized net results. A “microtransaction” label or a permanent in-game location does not by itself determine regulatory treatment. Obtain qualified legal review before pooling sale proceeds, deploying treasury assets, or marketing profit-sharing.

## Integration status

This is a server-side workflow primitive. It is not wired into the live property-sale UI, wallet authentication, email/push provider, or a marketplace transfer service. Sales should remain disabled until those integrations, terms, and security checks are reviewed.
