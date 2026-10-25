# Kimi code-review integration

BURN City has an optional **read-only** Kimi review endpoint. It sends an explicitly supplied review context to the Kimi OpenAI-compatible chat-completions API. It does not execute generated code, modify GitHub, deploy, or access wallet signing keys.

## Configure

Set these as server-side environment variables / deployment secrets:

- `KIMI_API_KEY`: a newly generated key from the Kimi platform. Do not commit it or expose it to the browser.
- `KIMI_MODEL` (optional): model identifier enabled for your Kimi account; defaults to `kimi-k2.5`.
- `KIMI_API_URL` (optional): override only if your account uses a different official API endpoint.

The default endpoint is `https://api.moonshot.ai/v1/chat/completions`. The feature remains disabled when `KIMI_API_KEY` is absent. Restart/redeploy the server after setting secrets.

## Use

Send a POST request to `/admin/kimi/review` with the existing `x-admin-token` header and JSON body:

```json
{ "context": "Review this focused code excerpt for security and correctness: ..." }
```

The route is protected by the existing admin-token check and IP rate limiting. Context is limited to 6,000 characters; the request uses a bounded response and a 20-second timeout. Provider response bodies and credentials are never echoed in errors. The result is advisory: independently verify findings and run repository tests before changing code.

## Security note

Any key pasted into chat, committed, logged, or embedded in client code must be treated as exposed. Revoke it and create a replacement in the provider dashboard. Never use the exposed key.
