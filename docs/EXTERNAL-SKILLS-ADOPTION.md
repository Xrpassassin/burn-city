# External skills adoption matrix — BURN City

Reviewed 2026-10-26. Reference the upstream projects; do not bulk-copy their agent configs, hooks, shaders or code into the live application.

## 1. Vercel Web Interface Guidelines — UI audit
Source: https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278/skills/web-design-guidelines

The pinned skill is an **audit workflow**, not a CSS component library. Its procedure fetches the current checklist from https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md, inspects selected files, and reports terse file:line findings.

Adoption: use it to audit BURN City UI overlays, Estates property panels, fishing controls and mobile navigation. Record each finding with severity, screenshot or reproducible evidence, file:line, and proposed fix. Pin a dated copy/version of the checklist for repeatable CI audits; the upstream skill itself asks for latest rules on each run.

## 2. Claude Code Game Studios — selective production discipline
Source: https://github.com/Donchitos/Claude-Code-Game-Studios

Its README describes 49 agents, 74 skills, 15 hooks and 14 scoped rules. It targets Claude Code, and includes Godot, Unity and Unreal specialists rather than a ready-made Three.js architecture.

Adoption: borrow the *roles and gates*, not the entire template. For each BURN City change assign: feature owner (gameplay), architecture reviewer (cross-game APIs), visual reviewer (mobile/desktop), QA reviewer (regressions), release owner (merge readiness). Require a running build and retained screenshot/video evidence for player-visible changes. Avoid mandatory long design-document chains for small changes.

Do not copy its .claude settings or hooks into our repository without an isolated security and workflow review. Do not let third-party hooks alter Git, invoke shell commands, or write credentials without inspection.

## 3. WebGPU Three.js TSL — graphics research track
Source: https://github.com/dgreenheck/webgpu-claude-skill
Its README covers WebGPURenderer, Three.js Shading Language (TSL), node materials, compute, postprocessing, and device-loss recovery. It describes a skill, not a plug-and-play graphics upgrade.

Adoption: isolate a renderer capability probe and a small optional shader demo; retain the existing WebGL renderer as the default and fallback. Before attempting integration, inspect our pinned Three.js version, import map, browser support, existing postprocessing, GPU budgets, and mobile frame time. WebGPU is not a substitute for geometry, asset quality, draw-call optimization or good animation.

Prototype priorities: lake-water surface treatment, restrained AMM rail emissive effects, and optional particle work. Use feature detection, error handling, renderer recovery, a settings toggle, and screenshot/performance comparison before changing production defaults.

## BURN City acceptance gates
- No unrelated modifications to Estates fishing PR #295.
- No unreviewed dependency or remote-code execution.
- Desktop and 390x844 mobile visual evidence for any UI change.
- Keyboard, touch, reduced-motion and accessibility regression checks.
- WebGL parity and fallback for any WebGPU experiment.
- Measured frame time, memory and visual quality before/after; no performance claims without data.
- Explicit review of wallet authentication, property permissions and game economy whenever touched.

## Suggested next implementation PRs
A. Audit existing Estates and fishing overlays using Vercel's checklist; fix top-impact issues.
B. Add a lightweight QA evidence checklist and release gate to PR templates, inspired by Game Studios.
C. Create an opt-in WebGPU/TSL proof of concept in an isolated module, without changing the production renderer.

## Agent handoff
Grok/Hark: read docs/BURN-CITY-FRONTEND-DESIGN.md and this file before changing UI or graphics. Implement the smallest independently testable change. Report exactly what was committed, what tests ran, screenshots observed, unsupported browsers, and known gaps. Do not claim an audit, visual smoke test, or live WebGPU support without actually performing it.
