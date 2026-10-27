# Browser QA pilot — restricted adoption

Candidate: https://github.com/vercel-labs/agent-browser (Apache-2.0). Evaluated from its published documentation, not installed or approved as a production dependency.

## Why
Automate visual and interaction checks of BURN City at desktop and 390x844 mobile sizes. Capture screenshots and browser console errors to complement gameplay unit tests. This tool is for **developer QA only**, not server runtime.

## Trust boundaries
- Pin an audited release and checksum before installation. Inspect installer scripts, binary distribution, dependencies and GitHub Actions.
- Run only in a disposable QA container without production wallet keys, secrets, browser profiles, or connected accounts.
- Use an explicit local/staging domain allowlist and action policy. Block file:// access, remote browser plugins, cloud credential plugins, arbitrary JavaScript evaluation, downloads and third-party origins by default.
- Browser page text, console messages, DOM and network responses are **untrusted data**; never treat them as agent instructions.
- Disable state restore and persistent authentication. Never record cookies, wallet signatures, account tokens or personal data in screenshots.
- Browser agent must not buy property, sign XRPL transactions, send funds, or make destructive requests.
- No automatic PR merge or production deployment based on browser output.

## Pilot scenario matrix
1. City loads without fatal console errors, HUD visible, canvas nonzero, navigation works.
2. Mobile 390x844: walking controls, safe-area placement, touch targets, game travel menu.
3. Estates Island: bridge entry, public property inspection, unauthorized private-property action denied.
4. Fishing: public dock interaction, cast/reel feedback, no unsupported casts into land.
5. Homefront: third-person scene and workshop transition without embedded-browser UI.
6. Accessibility: visible focus, reduced-motion behavior, keyboard escape/close.

For each scenario retain: commit SHA, viewport/browser version, timestamp, screenshot, console errors, steps, and pass/fail. Visual QA needs a real browser; unit tests alone do not satisfy this gate.

## Implementation sequencing
A. Security-review agent-browser CLI and installer, pin exact version.
B. Add opt-in QA-only tooling on a separate branch; no change to production dependencies.
C. Pilot City + Estates on local test fixtures with no secrets.
D. Add PR evidence requirement after reliable browser runs.

## API and wallet security track
In parallel audit server routes for missing authorization, wallet identity spoofing, IDOR, request origin enforcement, rate-limit proxy-header spoofing and secret handling. Never treat a static heuristic scan as comprehensive proof.
