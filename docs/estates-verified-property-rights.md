# Estates verified property rights

The `GET /api/estates/access?propertyId=...` endpoint resolves access from the authenticated bearer-token account and the server-side Estates ownership ledger. The caller cannot submit an owner account, permission list, or authorization grant.

A private right is granted only when the ownership service returns an exact property/account row whose `propertyId` and `acct` match the requested property and authenticated account. The resolver creates a short-lived server-internal grant and runs it through `authorizeEstateAction`; a missing row, mismatched account, malformed request, or unavailable ownership service fails closed.

The response is an authorization decision, not proof that property sales or ownership records are currently active. Sales remain disabled, so a new user should expect private-property access to be denied until a valid ownership record exists through an approved settlement process. The browser must treat this endpoint as advisory for UI only; every future enter/build/save operation must repeat the server-side check at the action boundary.

This is not a cryptographic grant, not a wallet signature by itself, and not a persistence or purchase implementation. The trusted identity is the account in the verified bearer session; ownership is the server's recorded property row. No browser-supplied `acct`, NFT ID, or grant can substitute for either.
