---
phase: "32"
slug: "page-tools"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-22"
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `32-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Plain-node derive-and-compare scripts plus BiDi live scripts on `scripts/lib/pb-live-probe.mjs`, one driver: `scripts/verify-platform.sh` |
| **Config file** | The registry inside `scripts/verify-platform.sh` (quick block for `--quick`; the live block for full runs) |
| **Quick run command** | `scripts/verify-platform.sh --quick` |
| **Full suite command** | `scripts/verify-platform.sh` (needs the built binary, the last Theia build, and a packaged tree for the P-tier row) |
| **Estimated runtime** | ~90 seconds quick; live rows add minutes |

Proof tiers: **S** static gate (`--quick`, with `--self-test`); **D** sidecar DOM check on :4000 (`POWERBROWSER_TOKEN_DISABLE=1`), DOM-only; **L** live binary with `-purgecaches` (`withProbeShell`), push recorder, chrome-scope evaluate and TIP keys; **P** packaged live launch (ng-072 pattern, `extractPackage`) for the save/export path only.

---

## Sampling Rate

- **After every task commit:** `scripts/verify-platform.sh --quick` (stage new files first for the brand scan; after any `PowerBrowserAPI.sys.mjs` edit run `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix` then `bash scripts/check-internals-boundary.sh --catalogue`)
- **After every plan wave:** `--quick` plus `node scripts/verify-page-tools-live.mjs` after a Theia build
- **Before every live run:** `sha256sum -c --status objdir/.pb-050-build.sha256` (the live suites' preflights enforce it); plan 32-09 is the only Phase 32 plan that rebuilds the binary
- **Before `/gsd-verify-work`:** full `scripts/verify-platform.sh` green
- **Max feedback latency:** ~90 seconds (quick)

---

## Per-Task Verification Map

Requirement-level map; plans bind task IDs to these rows.

| Requirement | Behavior | Tier | Automated Command | File Exists | Status |
|-------------|----------|------|-------------------|-------------|--------|
| probe (D-14) | `downloads-today`: a page-started download's behavior is recorded (lands silently vs appears); `print-today`: the system-dialog path completes with no tab-dialog box; `edit-today`: per-command verdict (content-native vs chrome-help) — all three EXECUTED in 32-01, verdicts written to `scripts/lib/pb-probe-verdicts.json` which later plans read | L | `node scripts/verify-page-tools-live.mjs --scenario downloads-today,print-today,edit-today` | ❌ W0 | ⬜ pending |
| PAGE-01 | Ctrl+F opens the find bar (page rect shrinks); typing + Enter runs `fastFind`; F3/Shift+F3 step; Esc closes + clears selection; highlight-all/match-case/whole-words re-run; count shows `{current} of {total}` or "Phrase not found" | S + D + L | `node scripts/verify-page-tools-find.mjs` (+ `--self-test`); `verify-page-tools-live.mjs --scenario find` | ❌ W0 | ⬜ pending |
| PAGE-01 | find kinds ↔ union; relay rows mirrored `PAGE_KEYS`↔`PAGE_SHORTCUTS` by the UI task | S | `--only gui02-web-tab-bridge` (+ self-test); `--only shortcut-relay` (+ self-test) | ✅ grows | ⬜ pending |
| PAGE-02 | Ctrl+plus/minus/0 step the overlay zoom; chip shows `{percent}%` only when ≠100%; click/Ctrl+0 resets and chip disappears | S + L | `node scripts/verify-page-tools-zoom-mute.mjs` (+ `--self-test`); `verify-page-tools-live.mjs --scenario zoom` | ❌ W0 | ⬜ pending |
| PAGE-03 | Ctrl+P (page-focus) opens the system print dialog for the overlay; cancel is a clean no-op; `window.print()` asserted absent-with-reason (D-09a); no tab-modal code path exists | S + L | `node scripts/verify-page-tools-print-save.mjs` (+ `--self-test`); `verify-page-tools-live.mjs --scenario print` | ❌ W0 | ⬜ pending |
| PAGE-04 | Tabs, strip rows and pill rows render the pushed `data:image/` icon; anything else falls back to `codicon-globe`/search glyph; no icon fetch crosses the network | S + L | `verify-page-tools-live.mjs --scenario favicon` (+ static icon-cap assertion in the reader-crash gate) | ❌ W0 | ⬜ pending |
| PAGE-05 | Playing tab shows the audio mark on tab + strip (muted-ink variant when muted); Ctrl+M toggles (page-focus); pill never carries mute | S + L | `node scripts/verify-page-tools-zoom-mute.mjs` (+ `--self-test`); `verify-page-tools-live.mjs --scenario audio` | ❌ W0 | ⬜ pending |
| PAGE-06 | Every page-started download appears as a row (no silent saves); rows open / show-in-folder / cancel / retry; badge counts in-progress + unread; opening the panel marks finished read | S + L | `node scripts/verify-page-tools-downloads.mjs` (+ `--self-test`); `verify-page-tools-live.mjs --scenario downloads` | ❌ W0 | ⬜ pending |
| PAGE-08 | Ctrl+S (page-focus) opens "Save page as"; chrome writes the minted dir; guards intact (private / non-http(s) / oversized refused); failure row with retry | S + L (+ P for export) | `node scripts/verify-page-tools-print-save.mjs` (+ `--self-test`); `verify-page-tools-live.mjs --scenario save` | ❌ W0 | ⬜ pending |
| PAGE-09 | Frozen edit-cmd set; content-native keys need no round-trip (no bridge traffic on typing); Theia-initiated Cut/Copy/Paste/Undo work; items grey when not enabled; no clipboard read without gesture | S + L | `node scripts/verify-page-tools-edit.mjs` (+ `--self-test`); `verify-page-tools-live.mjs --scenario edit` | ❌ W0 | ⬜ pending |
| PAGE-10 | Reader toggle enabled only on article pages; toggling stays in the same tab (history intact); `view-source:` never appears in Theia sources; F12 opens the stock DevTools window via Phase 31 `openStockPage` | S + L | `node scripts/verify-page-tools-reader-crash.mjs` (+ `--self-test`); `verify-page-tools-live.mjs --scenario reader,source,devtools` | ❌ W0 | ⬜ pending |
| PAGE-11 | NAMED scratch tab loads `about:crashcontent` chrome-side; its crash shows the contracted Theia crash UI over the overlay + crashed push (no displayLoadError, no stock copy; sibling-process overlays recorded); tab/strip show "This tab crashed. Reload to try again." + "Reload tab"; Reload runs `webTabReload`; history (`gotoIndex`) survives; shared-process blank-reload regression row | S + L | `verify-page-tools-live.mjs --scenario remoteness-repro` before the fix (verdict `reproduced`) and after it (`not-reproduced`); `verify-page-tools-live.mjs --scenario crash,remoteness-regression` (+ static reload-path assertion in the reader-crash gate) | ❌ W0 | ⬜ pending |
| PAGE-05, PAGE-02 (extensions; plan 32-09) | Host nodes keep `muted`/`muteReason`/`soundPlaying` in sync through one mute helper; `tabs.update({muted})` mutes the overlay through `toggleMuteAudio` and Theia's `audioMuted` follows; `tabs.getZoom` and `tabs.onZoomChange` work through the `ZoomManager`/`FullZoom`/`ZoomUI` shims (D-28 as amended) | S + L | `bash scripts/check-internals-boundary.sh --self-test`; `node scripts/verify-shell-gbrowser-standin.mjs` (+ `--self-test`, plants (t)-(w)); `verify-ext-tab-host-live.mjs --scenario ext-mute,ext-zoom-get,ext-zoom-change` (+ `--self-test`) | ✅ grows | ⬜ pending |
| binary (plan 32-09) | 050 regenerated without its two zoom skips; guard gate G1-G7; scope gate reasons `ext-tabs.js:register` with `host:ZoomManager`; shared-tree preflight, replay, `./mach build` and a new stamp; every later live row checks the stamp first | S + L | `node scripts/verify-ext-tab-host-patch-guards.mjs` (+ `--self-test`); `node scripts/verify-ext-tab-host-scope.mjs` (+ `--self-test`); `sha256sum -c --status objdir/.pb-050-build.sha256`; the full `verify-ext-tab-host-live.mjs` run | ✅ grows | ⬜ pending |
| all kinds | every new `webTab*` arm ↔ union literal; every arm classified; privileged/network rules hold | S | `--only gui02-web-tab-bridge` (+ self-test) | ✅ grows | ⬜ pending |
| copy | every new string in `CHROME_BAR_COPY`; no brand literal; no internal identifier | S | `--only shell-error-copy-no-internals` (+ self-test) | ✅ grows | ⬜ pending |
| keys | every new page key mirrored `PAGE_KEYS`↔`PAGE_SHORTCUTS`; Theia keeps clashing keys outside web-tab focus | S + L | `--only shortcut-relay` (+ self-test); live `theia-keeps-keys` | ✅ grows | ⬜ pending |
| types+boundary | tab-uris and chrome-bar compile; catalogue rows and lines; brand residue | S | `--only chrome-bar-typecheck`, `--only tab-uris-typecheck`, `--only internals-catalogue`, `--only ng-040-internals-catalogue-lines`, `--only scan-brand-residue` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/lib/pb-live-probe.mjs` extensions (only if a probe needs a helper the nav/address harnesses lack; reuse `withProbeShell`, `installPushRecorder`, `openWebTab`, `inChrome`, `focusOverlay`, `focusTheiaFrame`, `pressKey`, `serveNavPages` otherwise)
- [ ] `scripts/verify-page-tools-live.mjs` + `--self-test` — scenarios `downloads-today`, `print-today`, `edit-today` (probes) then `find`, `zoom`, `print`, `favicon`, `audio`, `downloads`, `save`, `edit`, `reader`, `source`, `devtools`, `crash`, `remoteness-repro` (32-07 Task 1, record-only, own session, verdict key `remoteness-repro` in `scripts/lib/pb-probe-verdicts.json`: `reproduced` before the fix, `not-reproduced` after), `remoteness-regression`; served fixtures: multi-frame page (find counts), media page (audio), download endpoint + request log (no-silent-save), reader article + non-article, five same-site tabs on one origin (remoteness regression), scratch overlay loading `about:crashcontent` (crash, closed after the verdict); `PLANTS`: removed relay row, key enabled while Theia focused, silent download (panel row missing), print tab-modal call, `view-source:` literal in Theia
- [ ] `scripts/verify-page-tools-find.mjs` + `--self-test` — kind-set equality (find arms ↔ union ↔ state count fields ↔ copy find rows); plants: dropped kind, stale union member, copy pin missing
- [ ] `scripts/verify-page-tools-zoom-mute.mjs` + `--self-test` — arms ↔ union ↔ state fields + chip/mark copy; plants: dropped arm, stale field, chip reading prefs
- [ ] `scripts/verify-page-tools-print-save.mjs` + `--self-test` — arms ↔ union; `getTabDialogBox`/`_openTabModalPrint`/browserDOMWindow-shim absence; `savePageCopy` guards intact; plants: tab-modal call smuggled in, minted-dir check removed, shim added
- [ ] `scripts/verify-page-tools-downloads.mjs` + `--self-test` — arms + `addView`/`removeView` lifecycle + row-action set + serialized row fields; plants: `DownloadsPanel` reference, unserialized push, silent-save path
- [ ] `scripts/verify-page-tools-edit.mjs` + `--self-test` — frozen cmd literal set; plants: extra cmd literal, bare-command call site
- [ ] `scripts/verify-page-tools-reader-crash.mjs` + `--self-test` — arms ↔ union + toggle/crash copy + `view-source:` wall; plants: `view-source:` literal in Theia, custom inspector import
- [ ] Registry rows in `scripts/verify-platform.sh`: six `page-tools-*` + six `page-tools-*-self-test` (quick); `page-tools-live`, `page-tools-live-self-test` (live)

*If none: "Existing infrastructure covers all phase requirements." — not the case; all above are Wave 0.*

---

## Threat Model (phase-level; plans carry per-plan registers)

| Threat ID | Category | Component | Severity | Disposition | Proven By |
|-----------|----------|-----------|----------|-------------|-----------|
| T-32-01 | Spoofing | every new `webTab*` sender | high | mitigate | `groupSenderIsTheia` + `webTabIdIsValid` walls on every arm; bridge gate pins the shape |
| T-32-02 | Tampering | `webTabFind` query / `webTabZoom` value / `webTabMute` flag / `webTabEdit` cmd / `webTabViewSource` URL | high | mitigate | chrome-side validation (caps, booleans, finite clamp, frozen literals, inner-URL scheme check); overlay derived from `webTabs`, never a frontend reference |
| T-32-03 | Tampering | `view-source:` / `about:reader` across the scheme wall | high | mitigate | Theia never holds the URL; chrome mints the load; reader-crash gate asserts the absence |
| T-32-04 | Information disclosure | find query / page bytes / clipboard in logs or pushes | medium | mitigate | fixed refusal text; pushes carry counts/status, never query text; paste only on explicit gesture; no log line carries page text |
| T-32-05 | Information disclosure | token cookie via downloads/save revalidation | medium | mitigate | clear-data exemption by name; `FROM_CACHE` honors the jar; print-save gate + live cookie log |
| T-32-06 | Elevation of privilege | state-changing kind as a bare command/palette entry | medium | mitigate | widget-handler-only rule; bridge gate pins call-site shape; edit gate plant |
| T-32-07 | Denial of service | oversized query / unclamped zoom / unbounded download rows | low | mitigate | length caps, MIN..MAX clamp, panel cap idiom (`max-height: min(432px, …)`) |
| T-32-SC | Tampering | supply chain | low | accept | no new package in any plan |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Find highlight wash tint and bar/panel look against 32-UI-SPEC | PAGE-01, PAGE-06 | Visual quality | KWin raise + `spectacle`; compare with 32-UI-SPEC spacing/type/color rows |
| Real OS print dialog (printer list, cancel) | PAGE-03 | Automated check asserts the branch, not the OS dialog | Ctrl+P on a page, cancel; no tab-modal preview appears |
| Real download open/reveal in the OS file manager | PAGE-06 | OS integration | Finish a download, Open + Show in folder |
| Real IME in the find field | PAGE-01 | TIP composition is evidence, not UAT (PROJECT.md) | Compose CJK text in the find field; Enter during composition commits nothing |
| Stock DevTools window contents for the overlay | PAGE-10 | Automated check asserts the window opens, not its contents | F12 on a page; inspector shows the page's DOM |

Deferred to Chris's own end-of-milestone checks per the standing instruction in STATE.md.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

- [ ] `nyquist_compliant: true` set in frontmatter (set by `/gsd-validate-phase`, not by the planner or executor)

**Approval:** pending
