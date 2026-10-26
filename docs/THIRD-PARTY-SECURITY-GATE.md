# Third-party code security gate

All outside code, AI skills, models, shaders, npm packages, and automated-agent configuration are untrusted until reviewed. This policy applies to Grok, Hark, Claude, and human contributors.

## Admission process
1. **Provenance** — Record canonical repository, exact immutable commit or package version, license, files imported, author, and why we need it. Never execute remote install commands as an audit shortcut.
2. **Static inspection** — Review entrypoints, install/postinstall scripts, GitHub Actions, agent hooks, shell commands, network calls, dynamic evaluation, filesystem writes, telemetry, and credential handling. Check transitive dependencies and package lock changes. Run `npm run audit:external` as a first-pass detector, **not** as proof of safety.
3. **Isolation** — Trial third-party shaders, renderers, and agents in a disposable branch/environment without production secrets, wallet keys, write credentials, or live player data. Disable outbound network unless explicitly needed. Treat markdown skills as instructions that can carry prompt injection.
4. **Functional validation** — Run existing unit/integration tests, visual mobile/desktop smoke checks, performance checks, and a negative test for unauthorized operations.
5. **Approval** — Require a reviewer who did not author the import. Document findings and residual risk. No silent auto-updates or automatic execution of third-party hooks.
6. **Maintenance** — Track advisories, license obligations, versions, and a removal/rollback plan.

## Hard blocks
- Code or agents asking for seed phrases, private keys, wallet signing, cookies, tokens, SSH keys, environment secrets, or production DB dumps.
- Hidden telemetry, unexpected exfiltration destinations, remote scripts downloaded and executed at runtime/install, or opaque/minified payloads with no reviewable source.
- Agent instructions that override repository permissions or require disabling tests/security checks.
- Client-provided ownership or property access accepted as server authority.
- New production dependency or WebGPU renderer default switch without compatibility and fallback testing.

## Review record template
- Source and pinned revision:
- Files changed and dependency diff:
- License and provenance verified:
- Network, process, filesystem, secrets and hooks examined:
- Static scanner findings (including false positives):
- Dependency advisories and transitive review:
- Tests and screenshots:
- Reviewer / decision / rollback:

## Scope limitation
This policy and scanner do not establish that the existing codebase is free of malicious behavior. The scanner is a limited, deterministic first-pass heuristic; code review, dependency analysis, runtime monitoring, and independent approval remain mandatory.
