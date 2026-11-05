# Phase 59: Orca from source on Theia's Node - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-05
**Phase:** 59-orca-from-source-on-theia-s-node
**Areas discussed:** Pin form and source location, If slot-less start fails on both pins, Claude Code extension check, Build shell and Electron

---

## Pin form and source location

| Option | Description | Selected |
|--------|-------------|----------|
| Tag + commit SHA | orca_tag and orca_commit; fetch refuses a moved tag; --quick row compares both | ✓ |
| Tag only | Same form as firefox_esr_tag; a moved tag goes undetected | |
| You decide | Claude picks during planning | |

| Option | Description | Selected |
|--------|-------------|----------|
| Gitignored orca/ at repo root | fetch-orca.sh modelled on fetch-upstream.sh | ✓ |
| Inside objdir or a build cache | Disposable build input | |
| Nix fixed-output fetch | fetchFromGitHub with a hash in flake.nix | |

**User's choice:** Tag + commit SHA; gitignored orca/ at repo root.

---

## If slot-less start fails on both pins

| Option | Description | Selected |
|--------|-------------|----------|
| Stop and ask | Record the failure; each fix changes D-14 | ✓ |
| Raise PB's Node to 24.22.1 | One shared runtime; touches the Theia sidecar | |
| Ship a second Node 24.22.1 | Reverses D-14; ~100+ MB per OS | |

| Option | Description | Selected |
|--------|-------------|----------|
| Ready line + client pairs | Also proves build:web output via the spike 003 probe | ✓ |
| Ready line + loopback answer only | Roadmap wording | |

| Option | Description | Selected |
|--------|-------------|----------|
| Permanent full-run row | Named SKIP without a built orca/; re-pin re-proves it | ✓ |
| One-off, recorded result | Run once in this phase | |
| You decide | Claude picks | |

**User's choice:** Stop and ask; ready line plus client pairing; permanent full-run row.

---

## Claude Code extension check

| Option | Description | Selected |
|--------|-------------|----------|
| Open VSX via PB's Extensions view | User's own install path; version recorded | ✓ |
| VSIX from the VS Code Marketplace | Marketplace terms limit it to Microsoft products | |
| Bundled in theiaPlugins | Distribution decision | |

| Option | Description | Selected |
|--------|-------------|----------|
| Chat panel must work | Terminal-only = failed-partial, reshapes EXT-02 | ✓ |
| Either mode passes | Chat panel or terminal mode | |

| Option | Description | Selected |
|--------|-------------|----------|
| Chris, live, with his Claude login | Execution hands over a step list | ✓ |
| Automated with an API key | BiDi-driven, needs a key and webview automation | |

| Option | Description | Selected |
|--------|-------------|----------|
| A scratch repo | Throwaway repo; edits touch no real work | ✓ |
| Power-Browser itself | Realistic, edits a real branch | |

**User's choice:** Open VSX; chat panel must work; Chris runs it live; scratch repo.

---

## Build shell and Electron

| Option | Description | Selected |
|--------|-------------|----------|
| New nix develop .#orca | nodejs_24 + corepack_24; pnpm 12.14.0 from packageManager sha512 | ✓ |
| Extend .#theia | One shell fewer; shared toolchains | |

| Option | Description | Selected |
|--------|-------------|----------|
| Skip Electron entirely | Scripts off, build-workspace-packages + rebuild:node | ✓ |
| Run Orca's postinstall as-is | Downloads Electron, rebuilds twice | |

| Option | Description | Selected |
|--------|-------------|----------|
| Separate script until Phase 67 | No cost to the normal PB build | ✓ |
| Join the Theia build now | Earlier integration, slower sidecar builds | |

**User's choice:** New .#orca shell; skip Electron; separate script.

---

## Claude's Discretion

- Clone depth and fetch mechanics, script and row names, the brand-token class for "Orca".

## Deferred Ideas

None.
