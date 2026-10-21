---
phase: "29"
slug: "address-bar-search-and-fixup"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-21"
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `29-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Plain-node derive-and-compare scripts plus BiDi live scripts on `scripts/lib/pb-live-probe.mjs`, one driver: `scripts/verify-platform.sh` |
| **Config file** | The registry inside `scripts/verify-platform.sh` (quick block for `--quick`; the live block for full runs) |
| **Quick run command** | `scripts/verify-platform.sh --quick` |
| **Full suite command** | `scripts/verify-platform.sh` (needs the built binary, the last Theia build, and a packaged tree for the P-tier row) |
| **Estimated runtime** | ~90 seconds quick; live rows add minutes |

Proof tiers: **S** static gate (`--quick`, with `--self-test`); **D** sidecar DOM check on :4000 (`POWERBROWSER_TOKEN_DISABLE=1`), DOM-only; **L** live binary with `-purgecaches` (`withProbeShell`), push recorder, chrome-scope evaluate and TIP keys; **P** packaged live launch (ng-072 pattern, `extractPackage`).

---

## Sampling Rate

- **After every task commit:** `scripts/verify-platform.sh --quick` (stage new files first for the brand scan; after any `PowerBrowserAPI.sys.mjs` edit run `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix` then `bash scripts/check-internals-boundary.sh --catalogue`)
- **After every plan wave:** `--quick` plus `node scripts/verify-address-bar-live.mjs` after a Theia build
- **Before `/gsd-verify-work`:** full `scripts/verify-platform.sh` green
- **Max feedback latency:** ~90 seconds (quick)

---

## Per-Task Verification Map

Requirement-level map; plans bind task IDs to these rows.

| Requirement | Behavior | Tier | Automated Command | File Exists | Status |
|-------------|----------|------|-------------------|-------------|--------|
| BAR-01 | word + Enter searches the bar engine; no engine shows the no-search row | L | `node scripts/verify-address-bar-live.mjs --scenario search` | ❌ W0 | ⬜ pending |
| BAR-02 | `localhost:P`, `127.0.0.1:P`, `[::1]:P`, `localhost` open as addresses; `javascript:` and `file:` refused | L | `node scripts/verify-address-bar-live.mjs --scenario dev-addresses` | ❌ W0 | ⬜ pending |
| BAR-02 (token ruling) | overlay request to 127.0.0.1:P carries no `POWERBROWSER_TOKEN`; the Theia frame keeps it; planted observer-off goes red | S + L | `node scripts/verify-token-cookie-strip.mjs` (+ `--self-test`); `verify-address-bar-live.mjs --scenario token-cookie` | ❌ W0 | ⬜ pending |
| BAR-03 | served engine's suggestions render; setting off sends none; URL-shaped and composing text send none (positive control: search-shaped text sends at least one) | L | `verify-address-bar-live.mjs --scenario suggestions` | ❌ W0 | ⬜ pending |
| BAR-03 | every configured engine host has an allowlist row, stale rows red | S | `scripts/verify-platform.sh --only theia-endpoints` (+ self-test) | ✅ grows | ⬜ pending |
| BAR-04 | tracked `policies.json` `SearchEngines` equals the emission; no configured name collides with a shipped name; fragment fresh | S | `node scripts/verify-search-engines.mjs` (+ `--self-test`); `--only generate-check` | ❌ W0 | ⬜ pending |
| BAR-04 | packaged build lists exactly the configured engines; default is the first | P | `node scripts/verify-search-engines-packaged.mjs` | ❌ W0 | ⬜ pending |
| BAR-04 | the default-engine setting changes the engine used and the placeholder | L | `verify-address-bar-live.mjs --scenario default-engine` | ❌ W0 | ⬜ pending |
| BAR-05 | a one-off button searches with that engine and leaves the default unchanged | L | `verify-address-bar-live.mjs --scenario one-off` | ❌ W0 | ⬜ pending |
| BAR-06 | an open-tab row activates that tab; the push recorder shows no `loading: true` for it | L | `verify-address-bar-live.mjs --scenario switch-to-tab` | ❌ W0 | ⬜ pending |
| BAR-07 | a typed prefix autofills a visited origin with the completion selected; Tab accepts; Backspace suppresses | L | `verify-address-bar-live.mjs --scenario autofill` | ❌ W0 | ⬜ pending |
| BAR-08 | Alt+Enter opens a foreground tab; Ctrl+click and middle-click open a background tab | L | `verify-address-bar-live.mjs --scenario new-tab-targets` | ❌ W0 | ⬜ pending |
| BAR-09 | Shift+Del on a history row removes the page (`PlacesUtils.history.fetch` is null); on a bookmark row nothing is removed | L | `verify-address-bar-live.mjs --scenario shift-del` | ❌ W0 | ⬜ pending |
| BAR-09 / BAR-10 | every store kind classified; privileged kinds absent from `TAB_STORE_RELAY_KINDS`, called only from the widget, never a command | S | `--only gui02-web-tab-bridge` (+ self-test) | ✅ grows | ⬜ pending |
| BAR-10 | Cut, Copy, Paste, Paste & Go, Select All with the contracted enablement; Paste & Go with a chrome-written clipboard navigates | L + D | `verify-address-bar-live.mjs --scenario context-menu` | ❌ W0 | ⬜ pending |
| BAR-11 | first click selects all, a drag keeps its selection; Enter during IME composition commits nothing | L + D | `verify-address-bar-live.mjs --scenario select-ime` | ❌ W0 | ⬜ pending |
| BAR-11 | rows composed 1 + 4 + 5, deduped, capped at 10; type icon by source; favicons only as `data:` | S + L | `node scripts/verify-address-bar-rows.mjs` (+ `--self-test`); `verify-address-bar-live.mjs --scenario rows` | ❌ W0 | ⬜ pending |
| BAR-12 | a draft survives a tab switch and page navigation; commit, Esc restore and tab close clear it | L | `verify-address-bar-live.mjs --scenario drafts` | ❌ W0 | ⬜ pending |
| BAR-13 | Ctrl+Enter on `name` resolves to `https://www.name.com/` (reply asserted, no load); a dropped link loads; dropped text searches | L | `verify-address-bar-live.mjs --scenario canonize-drop` | ❌ W0 | ⬜ pending |
| BAR-14 | no brand literal in chrome-bar copy (brand derived from `configuration.toml`); every string pinned | S | `--only shell-error-copy-no-internals` (+ self-test) | ✅ grows | ⬜ pending |
| all | chrome-bar and tab-uris compile; boundary catalogue rows and lines; brand residue | S | `--only chrome-bar-typecheck`, `--only internals-catalogue`, `--only ng-040-internals-catalogue-lines`, `--only scan-brand-residue` | ✅ | ⬜ pending |
| all | engine-host ban, `row.uri` ban and the 8-row backend cap stay green | S | `--only gui06-chrome-bar-suggestions` (+ self-test) | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/verify-address-bar-live.mjs` + `--self-test` — scenarios above; a served page set with `/search` and `/suggest` request logs; a user engine added chrome-side (`SearchService.addUserEngine`) for hermetic search; plants: token strip off, Shift+Del on a bookmark row removes it, tab row navigates instead of switching. (A "suggestions sent for URL-shaped text" plant was rejected: chrome re-resolves and refuses, so building it needs a product-side switch that disables a security check; the `hel` positive control, chrome's direct fence assertion and the `setting-ignored` plant cover it, 29-06.)
- [ ] `scripts/verify-search-engines.mjs` + `--self-test` — fragment freshness, tracked `SearchEngines` equality, shipped-name collision against `upstream/services/settings/dumps/main/search-config-v2.json`, `{searchTerms}` present
- [ ] `scripts/verify-search-engines-packaged.mjs` — P tier on the ng-072 harness
- [ ] `scripts/verify-token-cookie-strip.mjs` + `--self-test` — cookie-name literal equals the token-gate const, topic `http-on-modify-request`, install inside `setGroupSenderPort`
- [ ] `scripts/verify-address-bar-rows.mjs` + `--self-test` — imports `address-bar-rows.ts` directly (Node 24 type stripping)
- [ ] `scripts/verify-web-tab-bridge.mjs` rule 12 (store-kind classification) + plants; `scripts/verify-shell-error-copy.mjs` widget brand ban + plant
- [ ] Registry rows in `scripts/verify-platform.sh`, one pair each: `search-engines`, `token-cookie-strip`, `address-bar-rows` (quick); `address-bar-live`, `search-engines-packaged` (live)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| A sidecar built with a different `applicationName` shows that name in the failure rows | BAR-14 | `applicationName` is compiled into the frontend bundle; a scripted check would need a second Theia build | Set `[identity] display_name` in a scratch copy, run `node scripts/generate.mjs`, copy the frontend-config fragment, `theia build`, run the sidecar on :4000, type `javascript:x` and Enter |
| Real IME (fcitx/ibus) on KDE Wayland | BAR-11 | TIP composition is evidence, not UAT (PROJECT.md) | Compose CJK text in the pill; Enter during composition must not navigate |
| Row look, one-off strip wrap, drop ring | BAR-05, BAR-11, BAR-13 | Visual quality | KWin raise + `spectacle`; compare with 29-UI-SPEC |
| Real engine suggestions over the network | BAR-03 | Automated checks use a local served engine | Type a word in the packaged build with suggestions on |

Deferred to Chris's own end-of-milestone checks per the standing instruction in STATE.md.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
