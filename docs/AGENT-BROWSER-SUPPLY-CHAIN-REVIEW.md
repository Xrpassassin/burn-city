# Agent Browser candidate: initial source review

Candidate: https://github.com/vercel-labs/agent-browser
Review date: 2026-10-26. Source inspected: main branch (NOT an immutable release).

Observed package metadata:
- package name: agent-browser
- observed version: 0.39.4
- license: Apache-2.0
- package scripts include postinstall: node scripts/postinstall.js
- source build specifies Node >=24 and pnpm >=11; BURN City uses Node 22 for its server.

Observed postinstall behavior:
- determines platform and architecture
- downloads a native executable from github.com/vercel-labs/agent-browser/releases/download/vVERSION/...
- uses HTTPS redirect following and writes the downloaded binary to the package bin directory
- marks it executable
- on global installations may replace npm command symlinks/shims
- probes system executables using child_process.execSync

Security disposition: **NOT APPROVED FOR INSTALLATION**.
These are legitimate potential installer behaviors, not evidence of malicious intent. However, the downloaded executable is a separate executable trust boundary; source inspection alone cannot establish its safety. No release checksum or binary provenance was verified.

Required gates:
1. Pin immutable Git commit and exact published package version.
2. Verify npm package provenance, integrity and the native binary checksum against independently trusted release metadata.
3. Inspect binary release workflow, dependencies and permissions; review redirects and installer side effects.
4. Install only in ephemeral QA image with no secrets, wallet access or production network access.
5. Run CLI help/version checks and the browser QA smoke runner against a local fixture.
6. Capture evidence and run explicit approval before enabling it in CI.

Do not add agent-browser to BURN City's production package.json, invoke npm install in a credentialed checkout, or run install hooks automatically.
