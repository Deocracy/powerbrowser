# Fix brief: H7-harness-live-panels-part2

Lane: harness. Items: 5. Files this group owns: `scripts/verify-orca-side-panel-live.mjs`, `scripts/verify-orca-pane-css-live.mjs`, `scripts/verify-orca-pane-standalone-live.mjs`, `scripts/verify-orca-workspace-live.mjs`, `scripts/verify-orca-add-project-live.mjs`, `scripts/verify-orca-landing-logo-live.mjs`, `scripts/lib/orca-pane-harness.mjs`, `scripts/verify-page-furniture-live.mjs`.

Item IDs: harness-live-panels-06; harness-live-panels-14; harness-live-panels-11; harness-live-panels-12; harness-live-panels-15.

## harness-live-panels-06: Pages clause f passes when only one of the derived sidebar entries is shown

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-side-panel-live.mjs:704`

**What is wrong.** Entries whose button is not found are skipped with `continue`. Only 'none shown' is red. A regression that hides all but one page entry from the hosted sidebar passes.

**Scenario.** Six page entries are derived from Orca's source; the hosted sidebar renders one. shown is 1, fFails is empty, and the clause reports PASS.

**Evidence.** side-panel:704-705 `if (!(await click())) continue; shown++;` and :716 `if (!shown) fFails.push('blind: ...')`.

**Suggested fix.** Compare the shown set to the derived set, naming each entry that is not shown (with a recorded allowance list derived from Orca's own conditions, e.g. the orchestration setting).

**Verifier (CONFIRMED, low).** Page entries whose button is missing are skipped with continue (:704). Only shown==0 produces a failure (:716). A sidebar showing one of six derived entries passes the clause. *Checked at:* scripts/verify-orca-side-panel-live.mjs:704-716

## harness-live-panels-14: Egress collector is blind to IP-literal and proxied destinations

- **Severity:** low
- **Verdict:** PLAUSIBLE
- **Location:** `scripts/verify-orca-side-panel-live.mjs:819`

**What is wrong.** Clause i parses 'Resolving host [...]' lines from nsHostResolver logs. The control only proves hostname lookups are visible. A fetch to an IP literal, through a proxy, or by DoH is not a resolver line for that host, so a hard-coded IP callout from the panels is never observed.

**Scenario.** An Orca component fetches https://203.0.113.9/ on render. No resolver line names it, and clause i passes.

**Evidence.** side-panel:361-373 resolvedHosts regex `/Resolving host \[([^\]]+)\]/g`; control fetches CONTROL_HOST (a name) at :514.

**Suggested fix.** Add a second control with an IP-literal URL and count socket-level connects (MOZ_LOG=nsSocketTransport:5), or add a CSP/connect-src check on the panels.

**Verifier (PLAUSIBLE, low).** The collector parses nsHostResolver 'Resolving host' lines, and the control fetch uses a hostname. An IP-literal fetch generally skips the resolver, and a proxy or DoH path would not log that host. The mechanism is well known. I did not re-read the clause i code in this pass, and whether the profile forces no proxy is a runtime detail. The residual gap is narrow. *Checked at:* scripts/verify-orca-side-panel-live.mjs:361-373, 514, 819 (not re-read in this pass)

## harness-live-panels-11: workspace-live readiness SKIPs on a source-pattern match that goes stale

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-workspace-live.mjs:184`

**What is wrong.** readiness returns a named SKIP (exit 0, counted PASS) when pb-pane-mount.tsx does not match /\bsubscribeOpenFiles\b/ and /\bsubscribeWorktrees\b/. The reason text says 'lane p65-01 not merged' but the condition is a regex on a file, so a rename or move silently disables the row.

**Scenario.** The entry file is refactored so these names move to another module. The regex fails, the row skips with a lane message and the whole TAB-05 live proof stops running.

**Evidence.** workspace-live:184 `if (!/\bsubscribeOpenFiles\b/.test(entry) || !/\bsubscribeWorktrees\b/.test(entry)) return { skip: 'lane p65-01 not merged ...', fail: null };`

**Suggested fix.** Make this a FAIL now that the lane is merged.

**Verifier (CONFIRMED, low).** readiness returns { skip } when the entry file text lacks the subscribeOpenFiles or subscribeWorktrees regexes. The skip reason names the lane, but the condition is a file-content match, so a refactor that moves those names silently disables the row. This is a maintainability hazard and not a security issue. The same function returns fail, not skip, for the other source-moved cases. *Checked at:* scripts/verify-orca-workspace-live.mjs:184

## harness-live-panels-12: workspace-live Monaco absence is scanned only over a terminal pane and diff expectations come from Orca's own record

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-workspace-live.mjs:391`

**What is wrong.** Clause c's absence scan runs over [data-pb-orca-pane] roots after opening only a New Orca Terminal pane, so an Orca editor pane would not be in the scan set unless one happens to be mounted. In clause b, the expected diff sides' revisions (mergeBase, headOid, commitOid, parentOid) are taken from the record Orca produced, then the text is compared to git for those same revisions; a wrong merge base chosen by Orca is not detected although the fixture's merge base is known.

**Scenario.** Orca opens an editor tab as a hosted pane kind for the file: no such root exists in the scan, so '.monaco-editor' absence is green. Separately Orca computes a wrong mergeBase for the branch diff; the check fetches blobs at that same wrong rev and agrees.

**Evidence.** workspace-live:391-394 `executeCommand('powerbrowser.orca.newTerminal') ... inPanes = [...document.querySelectorAll('[data-pb-orca-pane]')]`; :240-248 expectedDiffSides uses `rec.branch?.mergeBase`, `rec.commit?.parentOid`; :371 `expectedDiffSides(rec, ...)`.

**Suggested fix.** Derive mergeBase, parent and commit ids from the fixture repo with git (merge-base, rev-parse) and compare them to the record; scan every [data-pb-orca-pane] kind that Orca can mount for an editor, including a mounted editor pane as the positive case.

**Verifier (CONFIRMED, low).** The clause c scan runs over [data-pb-orca-pane] roots after opening only a terminal pane. It fails only if zero roots exist, so an editor pane root that was not opened is not scanned. Clause (a) separately checks that the file opens in a Theia editor. The diff expectations come from Orca's own record, as claimed (expectedDiffSides uses rec.branch.mergeBase and rec.commit.parentOid), so a wrong merge base would not be detected. Both are coverage gaps in a live harness. *Checked at:* scripts/verify-orca-workspace-live.mjs:240-248, 391-396

## harness-live-panels-15: Failure message prints up to 80 characters of the real system clipboard

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-page-furniture-live.mjs:1377`

**What is wrong.** The v1.7 change adds the clipboard value to the Copy Image Link failure text. With PB_LIVE_HEADED=1 on a Wayland session, clipboardText reads the desktop clipboard, so a failing run prints the first 80 characters of whatever the user last copied (a password or token) into the log or CI output. The same file writes 'pb-sentinel' and 'alpha' into that clipboard in headed mode.

**Scenario.** A developer runs the check headed after copying a password; Copy Image Link fails; the failure line includes the password prefix.

**Evidence.** page-furniture-live:1377 `return fail(`Copy Image Link did not put the image URL on the clipboard (it holds ${JSON.stringify(String(copied).slice(0, 80))})`);` and :1830 `process.env.PB_LIVE_HEADED === '1' && process.env.WAYLAND_DISPLAY`.

**Suggested fix.** Print only the length and whether it equals a known sentinel, or redact unless the value matches the expected URL shape.

**Verifier (CONFIRMED, low).** The failure message prints String(copied).slice(0,80) of the clipboard read through Services.clipboard in the app. The file runs headed on Wayland only when PB_LIVE_HEADED=1 and WAYLAND_DISPLAY are set, in which case the clipboard is the desktop one, so a failing run can print up to 80 characters of whatever the user last copied. It only prints on failure and only to the developer's own terminal. In headless mode the clipboard is the app's own. *Checked at:* scripts/verify-page-furniture-live.mjs:1375-1377, 1829

