# Phase 61: Spikes for pane hosting, browser parity and live sharing - Pattern Map

**Mapped:** 2026-11-09
**Files analyzed:** 14 (new or modified)
**Analogs found:** 12 / 14 (two partial)

All analog paths below are git-tracked source (scripts/, theia/, inventory/, .planning/spikes/, .claude/skills/). `orca/` is untracked and read-only; it is cited only as a model for the Vite config.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `.planning/spikes/004-orca-pane-hosting/README.md`, `results.md` | spike record | batch | `.planning/spikes/003-orca-headless-client-in-pb/README.md`, `results.md` | exact |
| `.planning/spikes/005-orca-browser-parity/README.md`, `results.md` | spike record | batch | same 003 files | exact |
| `.planning/spikes/006-orca-live-sharing/README.md`, `results.md`, `extension-notes.md` | spike record | batch | same 003 files | exact |
| `.planning/spikes/MANIFEST.md` (3 rows + 2 idea headings) | manifest | n/a | row 003 in `.planning/spikes/MANIFEST.md` | exact |
| `.planning/spikes/004-.../measure.mjs`, `provider-proof.mjs`, `floor-run.mjs` | spike driver | request-response | `.planning/spikes/003-.../probe.mjs` + `scripts/lib/pb-live-probe.mjs` | exact |
| `scripts/orca-browser-parity.mjs` (+ `--self-test`) | utility / check | transform (derive and compare) | `scripts/verify-orca-build-shape.mjs` (derivation) + `scripts/verify-licence-allowlist.mjs` (check/self-test shape) | exact |
| `.planning/spikes/005-.../DISPOSITIONS.md` | data table | transform | none for a table; shape from RESEARCH "Data shape for DISPOSITIONS.md" | no analog |
| `scripts/verify-platform.sh` (2 rows) | config / registry | n/a | rows at lines 3837-3862 | exact |
| `.planning/spikes/004-.../vite.pb.config.ts`, `build-pb-entry.sh` | config / build | batch | `orca/vite.web.config.ts` (read-only) | partial |
| `.planning/spikes/004-.../theia-route-a/*.tsx` (Theia `ReactWidget` host) | component | event-driven | `theia/extensions/chrome-bar/src/browser/layout-controls-widget.tsx` | role-match |
| Route B' web-tab pane widget | component | event-driven | `theia/extensions/tab-uris/src/browser/web-tab.ts` | exact |
| orcad start/pair/reap use in spikes | utility | request-response | `scripts/lib/orca-run.mjs` (reuse, do not copy) | exact |
| `inventory/brand-tokens.json` rows | config | n/a | "Orca" / "orca" rows (~line 960-1030) | exact |
| `.claude/skills/spike-findings-Power-Browser/references/orca-{pane-hosting,browser-parity,live-sharing}.md`, `SKILL.md` | doc / wrap-up | n/a | `references/orca-client-hosting.md`, `SKILL.md` | exact |

## Pattern Assignments

### Spike records 004 / 005 / 006 (from 003)

**Analog:** `.planning/spikes/003-orca-headless-client-in-pb/README.md` and `results.md`.

Frontmatter (README.md lines 1-9):
```yaml
---
spike: 003
idea: orca-client-in-pb
name: orca-headless-client-in-pb
type: standard
validates: "Given ..., when ..., then ..."
verdict: VALIDATED
related: [SEED-261103-o1g, GUI-02, phase-38-07-webview-token-gate]
tags: [orca, orcad, sidecar, token-gate, pairing, web-tab, live-probe]
---
```
Sections to keep: What This Validates (numbered sub-checks), Research, How to Run, What to Expect, Results, Investigation Trail (failed runs included). Add what 003 lacks (P61-09): a `## VERDICT` section (`GREEN | YELLOW (conditions) | RED (owner decision)`) and a `Route for Phase N:` line.

`results.md` shape (lines 1-12): a dated header naming the exact versions and the command; a table `| # | Sub-check | Result | Observed |` with PASS/FAIL plus the observed value, a control row, then `**Verdict: ...**` and "Findings the README did not predict". Measurements must carry the producing command (CONTEXT specifics).

Comparison naming (CONVENTIONS.md): letter suffix `002a/b/c` is the precedent for sibling variants. RESEARCH proposes one directory `004-orca-pane-hosting/` with Routes A / B / B' result files; state the choice in the manifest.

MANIFEST row to copy (last row of `.planning/spikes/MANIFEST.md`):
```
| 003 | orca-client-in-pb | orca-headless-client-in-pb | standard | Given `orca serve` ... then ... | VALIDATED | orca, orcad, sidecar, token-gate, pairing |
```
Columns: `# | Idea | Name | Type | Validates | Verdict | Tags`. Rows 004/005/006 are in RESEARCH "MANIFEST rows to add"; also add two `### idea` headings as the manifest does for 001-003.

CONVENTIONS to obey: Node ESM `.mjs`, no new dependencies, fresh temp profile and private `XDG_CONFIG_HOME` per run (`makeProfile`), chrome reads via BiDi `evaluateIn(app.chrome, ...)` with `Cc`/`Ci` kept inside the evaluated string, a Gecko change carried as a `.patch` inside the spike directory, never applied to `upstream/`.

### Spike drivers `measure.mjs`, `provider-proof.mjs`, `floor-run.mjs`

**Analog:** `.planning/spikes/003-orca-headless-client-in-pb/probe.mjs` and the shared libs named in CONVENTIONS (`scripts/lib/pb-relaunch.mjs`: `makeProfile`, `withShell`, `probe`, `pollFor`, `stockTabOn`; `scripts/lib/pb-live-probe.mjs`: `withProbeShell`, `openWebTab`, `inChrome`).

orcad lifecycle: import from `scripts/lib/orca-run.mjs` (do not re-implement). Exports: `ensurePbNode`, `orcaVersionFromPins`, `orcadEnv(baseEnv, {profileDir, orcaVersion})`, `assertEnv`, `parseReady`, `redact`, `installOutputRedaction(secrets)`, `startOrcad({nodeBin, orcaDir, profileDir, env, timeoutMs})`, `descendants`, `nodeExesInTree`, `stopOrcad(child, daemonPid, {graceMs})`, `REDACTED`, `BROWSER_PROVIDER_REL`. Pairing codes must pass through `redact`/`installOutputRedaction` before any log or results file (60-03 rule).

Navigate and title (spike 005 one-ability proof): `webTabNavigate` is a group-channel request at `powerbrowser/shell/PowerBrowserAPI.sys.mjs:2807-2811`:
```js
case "webTabNavigate": {
  ...
  return { ok: true, kind, where: PowerBrowserAPI.webTabNavigate(data.tabId, data.url) };
```
Title arrives as a `PowerBrowserWebTabState` event whose payload is `{kind:'state', tabId, loading, url, title}` (RESEARCH, `PowerBrowserAPI.sys.mjs:3829-3836`); `pb-live-probe.mjs` records every such detail in a push recorder in the Theia frame (header comment line 8) and has `openWebTab` and `loadedAt`-style waits. `scripts/lib/firefox-bidi.mjs` exports only generic harness pieces (`withFirefoxPage`, `waitFor`, `captureScreenshot`, `fromRemoteValue`, `FIREFOX_BIN`); it has no navigate/title helper, so the proof drives `webTabNavigate` through `pb-live-probe.mjs`, not through `firefox-bidi.mjs`. Any live run takes `flock /home/chris/coding/Power-Browser/.git/pb-live.lock` and never goes headed (CONTEXT).

### `scripts/orca-browser-parity.mjs` (utility, derive and compare)

**Analogs:** `scripts/verify-orca-build-shape.mjs` (derive from `orca/` source text), `scripts/verify-licence-allowlist.mjs` (check function pure over inputs, self-test with planted faults), `scripts/verify-orca-pin.mjs` (header block, SKIP semantics).

Header convention (verify-orca-pin.mjs lines 1-46): path comment, purpose, lettered assertions a..g, `Tier:` line, `Limit:` line, `Usage:` with `--self-test`, and a paragraph on how the self-test plants faults ("A plant whose anchor is absent from its input is itself a FAIL").

Regex derivation (verify-orca-build-shape.mjs 55-59):
```js
for (const c of MARKER_CONSTANTS) {
    const m = text.match(new RegExp(`^export const ${c} = ['"]([^'"\\n]+)['"]`, 'm'));
    if (m) names[c] = m[1]; else missing.push(c);
}
```
Adapt per RESEARCH "Count tripwire": read `src/shared/browser-client-automation-protocol.ts`, extract the `BROWSER_CLIENT_AUTOMATION_METHODS = [ ... ] as const` body, throw when the body or the set is empty (empty derivation must go red, Pitfall 5). Three derived sets (automation A, RPC names R from `src/main/runtime/rpc/methods/`, provider members M from `RuntimeBrowserCommands`) plus CLI users; renderer users are intersected with R (renderer i18n keys also match `browser.<x>`). Fail conditions: R member without a row, row without an R member, any derived count 0, component set disagreement.

Check/CLI shape (verify-licence-allowlist.mjs): `export function check(repoRoot, allowList, lsFiles)` returns `{fails, skips}`; a `render(r)` printer; unknown-argument exit 2 (lines 199-202); `if (args.includes('--self-test')) process.exit(runSelfTest());` (204); exit 1 on fails (210).

Self-test shape (lines 126-191): mkdtemp fixture with a `put(rel, body)` helper; green control first ("the clean fixture is not green ... so the plant results below would be meaningless"); absent tree yields exactly one SKIP and no FAIL; a plants array, each must go red naming the drift; cleanup verified; final line `${NAME} self-test: PASS -- N planted faults each went red naming the drift`. Required plants (RESEARCH Wave 0): orphan row, missing row, empty derivation, moved constant, wrong component set. Fixture constants named `.fixture-*` so green proves derivation, not literals.

Absent `orca/` -> named SKIP of the full row only (as `orca-build-shape` does); the `--self-test` row never needs `orca/`.

### `scripts/verify-platform.sh` registry rows

**Analog:** lines 3837-3862, e.g.
```
"orca-build-shape-self-test|node $REPO_ROOT/scripts/verify-orca-build-shape.mjs --self-test"
"licence-allowlist|node $REPO_ROOT/scripts/verify-licence-allowlist.mjs"
"licence-allowlist-self-test|node $REPO_ROOT/scripts/verify-licence-allowlist.mjs --self-test"
```
Append two rows after the last Orca block, each preceded by a `# NEW (61-NN, BRW-01, P61-04): ...` comment in the same voice (what is derived, what the self-test plants, quick vs full tier). Labels: `orca-browser-parity-self-test` (quick, hermetic) and `orca-browser-parity` (needs `orca/`, SKIP when absent). Never a sibling driver (CLAUDE.md). Check where `orca-build-shape` itself is registered (the full-tier row) to place the non-self-test row in the right tier list.

### `DISPOSITIONS.md` (no analog)

No existing tracked table of this kind. Use RESEARCH shape: one Markdown table row per RPC name, columns `ability | disposition | Gecko mechanism | tier | note`, disposition in `BiDi | BiDi+ | actor | native | impossible`; 92 rows at the pin; the parity script parses it, so keep one row per line and the exact header text. Pre-fill from `research/FEATURES.md` A.1/A.3 and relabel from this session's evidence.

### PB-added Vite config `vite.pb.config.ts` (partial analog)

No merged or extended Vite config exists in the PB tree (the only `mergeConfig`-style hit is none). Model on Orca's, read-only: `orca/vite.web.config.ts` (root `src/renderer`, `base: './'`, `build.outDir: out/web`, `emptyOutDir: true`, input `src/renderer/web-index.html`; RESEARCH lines 11/14/34/37). Pattern 1 example from RESEARCH:
```ts
import { mergeConfig, defineConfig } from 'vite'
import base from '../../../orca/vite.web.config'
import { resolve } from 'node:path'
export default mergeConfig(base, defineConfig({
  build: { emptyOutDir: false, rollupOptions: { input: { pbPane: resolve('src/renderer/pb-pane.html') } } }
}))
```
`build-pb-entry.sh` copies `pb-pane.html`/`pb-pane.tsx` into untracked paths under `orca/src/renderer/`, runs `vite build --config <spike>/vite.pb.config.ts`, then must prove `git -C orca status --porcelain --untracked-files=no` is empty (orca-build-shape counts modified tracked files only). Shell-script voice: copy `scripts/build-orca.sh` (run in `nix develop .#orca`). Single-React externals mapped to Theia's instance are a Wave 0 test (A4). One-pane mount template: `src/web/main.tsx` bootstrap and the `FloatingTerminalPanelSurface.tsx` mount (RESEARCH Pattern 2).

### Theia `ReactWidget` host (Route A)

**Analog:** `theia/extensions/chrome-bar/src/browser/layout-controls-widget.tsx`.

Imports (lines 15-20):
```ts
import * as React from '@theia/core/shared/react';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ApplicationShell, ContextMenuRenderer, ReactWidget } from '@theia/core/lib/browser';
```
Class shape (lines 31-43): `@injectable() export class X extends ReactWidget { static readonly ID = 'powerbrowser.<name>'; @inject(...) protected readonly ...; }` with a `@postConstruct()` init. Binding: `theia/extensions/chrome-bar/src/browser/chrome-bar-frontend-module.ts` (`export default new ContainerModule((bind, _unbind, _isBound, rebind) => {...})`, line 42). Register a main-area widget via `WidgetFactory` bound under a factory id, as `tab-uris-frontend-module.ts` does for `WEB_TAB_FACTORY_ID`. The Route A Theia widget is spike-directory code (`theia-route-a/`), not an added extension; do not edit `@theia/*` (hard rule 1). Mounting Orca's React in a ReactWidget is an A4 risk (two React copies); `@theia/core/shared/react` is Theia's instance.

### Route B' web-tab per pane

**Analog:** `theia/extensions/tab-uris/src/browser/web-tab.ts`.
```ts
export const WEB_TAB_FACTORY_ID = 'powerbrowser.web-tab';
export const EMPTY_PAGE_URL = 'about:blank';
export const WEB_TAB_STATE_EVENT = 'PowerBrowserWebTabState';
export const WEB_TAB_ACK_TIMEOUT_MS = 5000;
```
The widget is a main-area placeholder; chrome owns a `<xul:browser>` overlay aligned to its node; frontend to chrome as `PowerBrowserGroupRequest` DOM events, chrome to frontend as `PowerBrowserWebTabState`. Open one web tab per pane page through `WebTabOpenHandler`/`TabUriRegistry` (`tab-uri-registry.ts`); `TabUriRegistry`'s exported shape is asserted by `scripts/verify-registry-shape.mjs`, so do not change it. Not `StatefulWidget`; the factory refuses ids not minted this session (header comment lines 20-40). Reuse; the spike writes no new Theia extension.

### `inventory/brand-tokens.json` rows (P61-15)

**Analog:** the `"token": "Orca"` row (title form), with siblings `orca` (lower) and presumably `orcad`/upper forms (confirm with `grep -n '"token"' inventory/brand-tokens.json`). Fields: `token, case_form, class: "coincidental", target, expected_count, expected_files, only_in, reason`. `expected_files` and `only_in` are the same sorted list of tracked files containing the form; `expected_count` is the total occurrence count over those files, "measured by the scan itself on the staged tree, never estimated". Current Orca row: count 93 over 20 files including `.claude/skills/spike-findings-Power-Browser/references/orca-client-hosting.md`.
Add to each applicable form's lists: `scripts/orca-browser-parity.mjs`, the three new `references/orca-*.md`, any changed `SKILL.md`/`docs/BUILD.md`, and sources copies the wrap-up adds under `.claude/skills/spike-findings-Power-Browser/sources/`. Append a "COUNT MOVED a -> b (plan 61-NN, ...)" sentence to `reason` in the voice of the row above it. Procedure: `git add` the new files first (the scan reads `git ls-files`; an unstaged file is invisible), run `node scripts/scan-brand-residue.mjs`, read the counts, edit, rerun to exit 0. `.planning/spikes/` is excluded from the scan, so spike records need no rows. Coordinator re-runs at each merge.

### Skill wrap-up

**Analog:** `.claude/skills/spike-findings-Power-Browser/references/orca-client-hosting.md` and `SKILL.md`. SKILL.md frontmatter `description` lists feature areas; `<context>` has per-idea paragraphs and the line `Spike sessions wrapped: 2026-10-21 (001, 002a-c) and 2026-11-03 (003).` to extend; the Feature Areas table and Processed Spikes list also get rows. New references: `orca-pane-hosting.md`, `orca-browser-parity.md`, `orca-live-sharing.md`. Sources copies go under `sources/<NNN-name>/` and only resolve relative imports when run from `.planning/spikes/` (SKILL.md note). Also update `.planning/spikes/WRAP-UP-SUMMARY.md`.

## Shared Patterns

### Derive and compare, with a self-test that plants faults
**Source:** `scripts/verify-licence-allowlist.mjs` lines 126-191 and `scripts/verify-orca-pin.mjs` header. **Apply to:** `scripts/orca-browser-parity.mjs`. Never keep a hand list of expected abilities beyond DISPOSITIONS rows, which are themselves compared both ways. Never assert on the absence of a log line (CLAUDE.md).

### Pairing and secret redaction
**Source:** `scripts/lib/orca-run.mjs` `redact`, `installOutputRedaction`, `REDACTED`. **Apply to:** every spike driver and every results file that touches orcad pairing.

### Live-run discipline
`flock /home/chris/coding/Power-Browser/.git/pb-live.lock`, headless only, no real input; lanes never edit STATE.md, ROADMAP.md, WINDOWS.md or the ledger (CONTEXT).

### Hard-rule fit
No `@theia/*` edits, no `orca/` or `upstream/` edits (Orca seam diffs live as `.patch` inside the spike directory), Firefox reached only through `PowerBrowserAPI.sys.mjs` (the S2 `browser.clientHost.attach` path needs no Orca patch; S1 patches `orcad-browser-provider.ts` kind union at line 18).

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `DISPOSITIONS.md` | data table | No tracked disposition table exists; use RESEARCH column spec |
| `vite.pb.config.ts` | build config | No merged Vite config in the PB tree; model on `orca/vite.web.config.ts` read-only |

## Metadata

**Analog search scope:** `.planning/spikes/`, `scripts/` and `scripts/lib/`, `theia/extensions/{chrome-bar,tab-uris,modes}`, `inventory/brand-tokens.json`, `.claude/skills/spike-findings-Power-Browser/`, `powerbrowser/shell/PowerBrowserAPI.sys.mjs`.
**Pattern extraction date:** 2026-11-09
