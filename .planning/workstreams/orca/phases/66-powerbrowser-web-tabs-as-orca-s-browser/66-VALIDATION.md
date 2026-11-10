---
phase: "66"
slug: "powerbrowser-web-tabs-as-orca-s-browser"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-10"
---

# Phase 66 — Validation Strategy

> Per-phase validation contract. Derived from 66-RESEARCH.md "Validation Architecture" and the six plans. Nothing here needs a human (D-18); the four human items and the owner items are in 66-CONTEXT.md "Deferred Verification" for the end-of-milestone pass.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node 24 scripts registered as rows in `scripts/verify-platform.sh` (no unit framework) |
| **Config file** | none (registry rows; quick anchor immediately before `"allowlist-schema|check_allowlist_schema"`, full anchor immediately before the `)` closing the `QUICK -eq 0` list) |
| **Quick run command** | `scripts/verify-platform.sh --only <label>` |
| **Full suite command** | `scripts/verify-platform.sh --quick` inside `nix develop .#theia`; live rows under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock` with `MOZ_PURGE_CACHES=1` and inherited `ORCA_*` unset |
| **Estimated runtime** | ~450 seconds for `--quick`; each live row 1-4 minutes |

---

## Sampling Rate

- **After every task commit:** the lane's quick rows via `--only` (each with its `-self-test`), plus `node scripts/scan-brand-residue.mjs` after staging
- **After every plan wave:** the coordinator's per-merge rows (66-06 Task 1 step 3); `gui02-web-tab-bridge` green after p66-03's merge
- **Before `/gsd-verify-work`:** `--quick` green against the recorded baseline; after the Orca, Theia and `./mach build faster` rebuilds, under the live lock: `orca-browser-host-bundle`, `orca-browser-agent-live`, `orca-agent-mark-live`, `no-remote-agent-port-live`, `no-remote-agent-port-live-self-test`, `orca-browser-snapshot-live`
- **Max feedback latency:** 450 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 66-01-T1 | 01 | 1 | BRW-03 | T-66-03 | thin host attaches with no private Orca member; offer never printed | full (live, Node) | build-orca.sh log lines; `build-orca.sh --panes-only` keeps `pb-browser-host.js` in `pb-panes/`; `--only orca-browser-host-bundle` (attach, createPage, result, user close) | ❌ W0 | ⬜ pending |
| 66-01-T2 | 01 | 1 | BRW-02, BRW-03 | T-66-01, T-66-02, T-66-04 | no WebRuntimeClient reach, no constant write, no private subscribe, no inlined asset, tracked set unchanged; link gives one device and client placement (A3) | quick + full | `--only orca-browser-host-bundle-self-test`, `--only orca-overlay`, `--only orca-overlay-built` | ❌ W0 | ⬜ pending |
| 66-01-T3 | 01 | 1 | BRW-03 | — | N/A | quick | self-test row; lane scope check | ❌ W0 | ⬜ pending |
| 66-02-T1 | 02 | 1 | BRW-02, BRW-03 | T-66-05, T-66-08 | createPage opens one background agent tab; unbound ids refused; unserved methods never reach chrome | quick | Theia build; `--only orca-browser-abilities` (trace scenario) | ❌ W0 | ⬜ pending |
| 66-02-T2 | 02 | 1 | BRW-02, BRW-03 | T-66-06, T-66-07, T-66-08 | 92 rows = derived abilities; three-way set equality (chrome side SKIP until p66-03); no BiDi mechanism; dialogs native; a bound tab revealed only on a later store activation, never at its own createPage (P66-09 reveal tracker trace) | quick | `--only orca-browser-abilities-self-test`, `--only orca-browser-abilities`, `--only orca-pane-routes`, `diff-theia-core.sh`, `verify-registry-shape.mjs` | ❌ W0 | ⬜ pending |
| 66-02-T3 | 02 | 1 | BRW-02 | — | entry points derived from the pin route to a PB web tab or are dead; interface, link and prefix compared with p66-01 (SKIP until merged) | quick | `--only orca-browser-entry-points-self-test`, `--only orca-browser-entry-points`; bridge row reports exactly the two cross-lane lines | ❌ W0 | ⬜ pending |
| 66-03-T1 | 03 | 1 | BRW-03 | T-66-09, T-66-12 | wall before page work; flag only at creation; parking only for agent entries; one visibility predicate | quick | `--only orca-browser-tab-scope`, `--only gui02-web-tab-bridge` (+ self-test), boundary and catalogue rows, `verify-new-window-adopt.mjs` | ❌ W0 | ⬜ pending |
| 66-03-T2 | 03 | 1 | BRW-03, BRW-04 | T-66-10, T-66-11, T-66-14, T-66-15 | 40 methods behind the wall; container cookies; Stop lasting; idle 20 s; Cc[/Ci. only on catalogued child lines | quick | `--only orca-browser-tab-scope-self-test`, `--only internals-boundary-self-test`, `--only internals-catalogue`, `--only ng-040-internals-catalogue-lines` | ❌ W0 | ⬜ pending |
| 66-03-T3 | 03 | 1 | BRW-03 | T-66-13 | no WebDriver BiDi port, detector proven by a Remote Agent control in the same run | full (live) + quick | `--only no-remote-agent-port-live`, `--only no-remote-agent-port-live-self-test`, `--only privacy-hosts` | ❌ W0 | ⬜ pending |
| 66-04-T1 | 04 | 2 | BRW-03 | T-66-16 | snapshot only through the wall; references from the pinned binary | quick + full | generator run; catalogue rows; `orca-browser-snapshot-live` (SKIP in lane) | ❌ W0 | ⬜ pending |
| 66-04-T2 | 04 | 2 | BRW-03 | T-66-17, T-66-18 | refs per page, stale refs refused, delta per Orca's rules | full (live) | `--only orca-browser-snapshot-live` (coordinator) | ❌ W0 | ⬜ pending |
| 66-04-T3 | 04 | 2 | BRW-03 | T-66-19 | fixture version equals the pin | quick | `--only orca-browser-snapshot-live-self-test`, `--only orca-snapshot-fixtures` | ❌ W0 | ⬜ pending |
| 66-05-T1 | 05 | 2 | BRW-04 | T-66-20, T-66-22 | mark drawn from chrome's pushed state only; Stop is the only agentStop caller; copy free of identifiers | quick | Theia build, `--only shell-error-copy-no-internals`, `verify-tab-strip.mjs` | ❌ W0 | ⬜ pending |
| 66-05-T2 | 05 | 2 | BRW-05 | — | U-01..U-30 set-equal to the PB map; each contribution exists; deferrals name v2 ids | quick | `--only orca-browser-tools-self-test`, `--only orca-browser-tools` | ❌ W0 | ⬜ pending |
| 66-05-T3 | 05 | 2 | BRW-02, BRW-03, BRW-04 | T-66-21, T-66-23 | criteria 1-3 live; every absence after its detector; activation clause (j) after its store-activation detector; no-pane clause (k) | quick (self-tests) + full (live) | `--only orca-browser-agent-live-self-test`, `--only orca-agent-mark-live-self-test`; live rows SKIP in lane | ❌ W0 | ⬜ pending |
| 66-06-T1 | 06 | 3 | all | T-66-24, T-66-25 | merges scope-checked; build:extensions builds orca-browser before orca-panes; cross-lane clauses compared, never SKIP | live | `--only orca-browser-agent-live` under the lock; each cross-lane row exits 0 and shows no 'not merged' | n/a | ⬜ pending |
| 66-06-T3 | 06 | 3 | all | T-66-26 | brand rows measured; --quick vs baseline | quick + live | the five live rows; `scan-brand-residue.mjs` (+ self-test); `--quick` | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Requirement and criterion coverage

| Req / criterion | Rows |
|---|---|
| BRW-02 / SC1 | `orca-browser-entry-points` (+ self-test); `orca-browser-agent-live` clauses (a), (g), (j) activation, (k) no Orca pane; `orca-pane-routes` stays green |
| BRW-03 / SC2 | `orca-browser-host-bundle` (+ self-test); `orca-browser-abilities` (+ self-test); `orca-browser-tab-scope` (+ self-test); `orca-browser-agent-live` clauses (b)-(f), (h), (i); `no-remote-agent-port-live` (+ self-test); `orca-browser-snapshot-live` (+ self-test), `orca-snapshot-fixtures`; `internals-boundary`, `internals-catalogue`, `ng-040-internals-catalogue-lines` (extended by A2) |
| BRW-04 / SC3 | `orca-agent-mark-live` (+ self-test); `gui02-web-tab-bridge` (two kinds classified, Stop sender fenced); `orca-browser-tab-scope` (Stop and idle state) |
| BRW-05 / SC4 | `orca-browser-tools` (+ self-test) |
| Phase 62 deferred clause | `orca-browser-agent-live` clause (f), decoy, with `verify-orca-hidden-electron.mjs`'s stock half first |
| copy | `shell-error-copy-no-internals`; `privacy-hosts` |

---

## Wave 0 Requirements

- [ ] `scripts/verify-orca-browser-host-bundle.mjs`, `verify-orca-browser-abilities.mjs`, `verify-orca-browser-entry-points.mjs`, `verify-orca-browser-tab-scope.mjs`, `verify-no-remote-agent-port-live.mjs`, `verify-orca-browser-snapshot-live.mjs`, `verify-orca-browser-tools.mjs`, `verify-orca-browser-agent-live.mjs`, `verify-orca-agent-mark-live.mjs`, each with `--self-test`
- [ ] `scripts/lib/orca-browser-live.mjs` (shared live harness, no side effect on import)
- [ ] `scripts/gen-orca-snapshot-fixtures.mjs` and `scripts/fixtures/orca-snapshot/` (form, nav, manifest) generated by the pinned agent-browser 0.39.4
- [ ] `check-internals-boundary.sh --self-test` plants for `Cc[` and `Ci.` in the child (A2); `verify-web-tab-bridge.mjs` rule 7 and self-test case for an uncatalogued `Ci.`
- [ ] `verify-web-tab-bridge.mjs` agent-contract classification and its SKIP-until-merged rule (keyed on orca-browser sources in the source map)
- [ ] Rows appended at the two registry anchors in lane order 66-01..66-05

---

## Cross-lane clauses (named SKIP on a lane branch, compared on the merged tree)

| Row | Clause | SKIP trigger | Owner lane |
|---|---|---|---|
| `gui02-web-tab-bridge` | agent contract (kinds, push, privileged senders) | no `theia/extensions/orca-browser/src` file in the source map | 66-03 |
| `orca-browser-abilities` | chrome AGENT_METHODS in the three-way equality | `scripts/verify-orca-browser-tab-scope.mjs` absent | 66-02 |
| `orca-browser-tab-scope` | page-table invariants | `orca-browser-dispatch.ts` absent | 66-03 |
| `orca-browser-entry-points` | link import, placement assignment, host exports, link key, served prefix | `pb-browser-host-link.ts` absent | 66-02 |

On the lane p66-02 and p66-05 branches, `gui02-web-tab-bridge` runs the pre-66-03 rule set and reports exactly two lines (kinds without chrome arms; `agentControlChanged` subscribed but not pushed); the lanes verify that exact output. The coordinator rejects any of these SKIPs on the merged tree (66-06 Task 1).

---

## Manual-Only Verifications

All phase behaviors have automated verification. The visual and interaction checks (mark and Stop placement and readability, title mark in light and dark, a real agent session browsing while the user works, the privacy wording) and the owner items (spike 005 owner note, P66-08, P66-11, P66-22, P66-24, P66-26, O1, O2; the P66-33 diagnostics-row route is 66-06 Task 2's owner decision) run in the end-of-milestone pass (59-CONTEXT D-18).

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 450s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
