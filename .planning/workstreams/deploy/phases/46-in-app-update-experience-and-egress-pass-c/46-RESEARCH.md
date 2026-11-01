# Phase 46: In-app update experience and egress pass (C) - Research

**Researched:** 2026-10-22
**Domain:** Gecko update service observation + restart, Theia update UX, endpoint-allowlist release pass, FxA/Sync off proof
**Confidence:** HIGH for the update-service observer shape, restart path and copy-ownership rule; MEDIUM for the layer-3 egress proof (needs a real update flow that only Phase 50 can run live) and the partner-search-code record (upstream default inspected, live search Suggest traffic unobserved).

**Research flag:** None in SUMMARY. This file resolves the carried open items as far as they can be settled without a live release, and gives the planner the exact upstream touchpoints so UPD-18/19/27 need no further research.

## Summary

The whole phase is a standard pattern: observe, don't reimplement. Upstream's `UpdateService.sys.mjs` already notifies `update-available` / `update-staged` / `update-downloaded` / `update-error` with a status string, and `UpdateListener.sys.mjs` already shows how to restart (`requestRestart`: announce `quit-application-requested` with `"restart"`, then `Services.startup.quit(eAttemptQuit | eRestart)`). The shell observes those four topics through the boundary file, reads `nsIApplicationUpdateService.currentState`, and pushes `{kind:'appUpdate', status, version?}` over the existing `PowerBrowserWebTabState` push. The Theia side renders the three contracted string families and two palette commands from the `@powerbrowser/branding` contribution. The egress pass is allowlist edits plus derived-row updates, with the live release-asset observation deferred to Phase 50 criterion 5.

**Primary recommendation:** two shell observers (one `Services.obs` observer for the four update topics + one read of `currentState` on demand), three new `handleShellMessage` kinds, one Theia update client reusing the `profile-storage.ts` request/reply shape, one copy row, one request-kinds row, the `mar-update-hop` row extended to assert the ready notification + restart + cannot-update plant, and the UPD-15 allowlist edits in a single plan. UPD-27 is a small in-Gecko probe asserting the exposure call neither throws nor requests network with `MOZ_NORMANDY` out.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Update state truth | Gecko update service (`UpdateService.sys.mjs`, observed only) | — | UPD-18: observe `update-staged/downloaded/available/error` + `currentState`; never reimplement staging or download state |
| Shell restart | Boundary file (`PowerBrowserAPI.sys.mjs`), `UpdateListener.requestRestart` shape | — | UPD-19: announce `quit-application-requested`, then `eAttemptQuit \| eRestart`; the layout flush (`runQuitFlushSync`) still runs first |
| Update UX strings | `@powerbrowser/branding` contribution (Theia side) | — | UPD-32: one derivation site for the copy row; exactly as the modes-copy precedent |
| Update commands | `@powerbrowser/tab-uris` (palette, `browser-window-command.ts` pattern) | — | UPD-23: two palette commands reusing the registration + id-constant pattern |
| Egress truth | `powerbrowser/endpoint-allowlist.json` + derived rows | — | UPD-15/28: edits + `theia-endpoints`, `allowlist-doc-consistency`, `ng064` rows stay green |
| Hop proof | `verify-mar-update-hop.mjs` evidence + WebDriver path | Phase 45 packaged re-run (Phase 50) | UPD-24: assert notification + restart + cannot-update plant now; packaged proof later |

## User Constraints (from CONTEXT.md)

<user_constraints>
### Locked Decisions
#### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding. Directly relevant: decision 6 (`identity.fxaccounts.enabled=false`, UPD-28); decision 9 (keep `--disable-crashreporter` — crash row is `deny`, UPD-15); decision 12 (24-hour canary delay — UX never offers an unpublished descriptor).
- UPD-33 (Phase 40): `user-initiated` disposition; unattended request fails like `deny`. UPD-15's asset-host rows are observed at layer 3 of a real update; live observation is Phase 50 criterion 5.
- Update channel derived everywhere (UPD-11); no plan renames it.
- Contracted user-facing strings name "PowerBrowser", no internal identifier, next step is an on-screen affordance.

#### Owner gates in this phase
- None. No live GitHub/Cloudflare/account action, no key, no push.

### Claude's Discretion
All other implementation choices are at Claude's discretion.
### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UPD-18 | Observe `update-staged/downloaded/available/error`, read `currentState`, push `{kind:'appUpdate',status,version?}` over `PowerBrowserWebTabState`; catalogue touchpoints; boundary green | §Observer shape, §Restart, §Pattern 1 |
| UPD-19 | Accept `appUpdateState`, `checkForUpdates`, `restartToUpdate`; restart via `eRestart` after `quit-application-requested` with flush; `shell-request-kinds` set-equality row + self-test | §Restart, §Pattern 2 |
| UPD-20 | Staged-update ready string with Restart now + Later + status-bar item; restart lands N+1 with layout | §Copy ownership; asserted by `mar-update-hop` |
| UPD-21 | Read-only app dir cannot-update string (+ macOS variant text present); Open download page | §Copy ownership; planted read-only dir in hop row |
| UPD-22 | Failed check could-not-check string with Check again at most once per session | §Copy ownership; once-per-session flag in client |
| UPD-23 | Palette "PowerBrowser: Restart to Update" + "PowerBrowser: Check for Updates" | §Copy ownership, `browser-window-command.ts` pattern |
| UPD-32 | Copy shape row over the branding contribution (names PowerBrowser, no internal id, next step is affordance); self-test plants a pref key | §Pattern 3 |
| UPD-24 | `mar-update-hop` asserts ready notification, Restart now → N+1 + layout, read-only plant → cannot-update | §Hop proof |
| UPD-27 | `recordExposureEvent` neither throws nor requests network with `MOZ_NORMANDY` out | §Exposure probe |
| UPD-15 | Allowlist: `github.com` + `release-assets.githubusercontent.com` rows, `crash-reports.mozilla.com` deny, corrected geolocation row + stale texts; doc-consistency green + self-test; partner-code status recorded | §Egress pass |
| UPD-28 | `identity.fxaccounts.enabled=false` in generated prefs; verify-endpoints run contacts no FxA/Sync host | §FxA/Sync off |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **One driver, one registry.** Every new check is one row appended to `scripts/verify-platform.sh` CHECKS with a `--self-test` twin. No sibling driver. Concrete rows: `shell-request-kinds` (+ self-test, quick), update-copy shape row (+ self-test, quick), `mar-update-hop` extension (full tier; self-test stays quick), UPD-27 probe (full tier; self-test in-memory/quick).
- **Self-test.** Every new check plants each fault and must go red naming the drift: stray request kind; pref key in one string; read-only plant not producing the cannot-update message; exposure call throwing or requesting network (fixture).
- **Derive and compare.** `shell-request-kinds` derives both kind sets at check time (accepted in `handleShellMessage` vs dispatched by the Theia client) and compares as set equality. The copy row derives strings from the branding contribution. Never hand-keep an expectation list.
- **Absence-of-log assertions.** UPD-27 and UPD-28 proofs must observe a positive signal (the call returned; the layer-3 capture lists the hosts it did contact and FxA/Sync hosts are absent from that derived list), never assert the absence of a line emitted by own instrumentation.
- **Quick tier.** `--quick` rows use no build, no browser, no display, no network. `mar-update-hop`, the UPD-27 live probe and the verify-endpoints run are full-tier; their self-tests are in-memory.
- **Residual-brand scan.** Stage new files (`git add`) before trusting a green scan. The originating product's name appears only in `inventory/brand-tokens.json`.
- **Patches regenerated, never text-edited.** No patch change is expected in this phase; if one proves necessary, use `scripts/regenerate-patches.sh`.
- **Upstream and Theia.** Never edit `upstream/` or Theia core. All chrome work lands in `PowerBrowserAPI.sys.mjs` (catalogued) and `@powerbrowser/*` extensions.
- **User-facing copy.** Contracted strings name "PowerBrowser", no internal identifier, next step is a real on-screen affordance. UPD-32 enforces by shape, not a banned list.
- **Hash-locked files.** Never touch `ledger/` or create/edit `scripts/verify-ng-NNN-*.mjs`.
- **Plan gate.** `python3 scripts/plan-gate.py --root . --phase 46 --plans <dir> --stream deploy`. The local `ledger/REQUIREMENTS.json` carries no `deploy`-stream rows (verified this session: 89 items, all stream `default`), so the gate passes on plans-directory presence; every UPD-* ID must still be cited in a plan (coverage gate).
- **Rebrand inputs.** New prefs/strings derive from `configuration.toml` through `scripts/generate.mjs`; no second-file edit for a rebrand.

## Observer shape (UPD-18) [VERIFIED: read this session]

`upstream/toolkit/mozapps/update/UpdateService.sys.mjs` notifies (subject, topic, status):
- `("update-available", "unsupported" | "cant-apply" | "show-prompt")` — lines 3958-4000. `cant-apply` carries subject `null` (bad-perms / read-only app dir case).
- `("update-staged", update.state)` — line 5181; `("update-downloaded", update.state)` — line 7318.
- `("update-error", "bad-perms" | "check-attempt-failed" | "download-attempt-failed" | ...)` — lines 1136, 1675-1689, 3447-3462, 7210-7230.

`UpdateListener.sys.mjs observe(subject, topic, status)` (lines 497-530) handles exactly `update-available`, `update-downloading`, `update-staged`/`update-downloaded`, `update-error`, `update-swap`. The shell observer handles the UPD-18 four (plus optionally `update-downloading` as a progress status — planner's choice, recorded). `subject.QueryInterface(Ci.nsIUpdate)` gives `version`/`displayVersion` for the push's `version?`.

`nsIApplicationUpdateService.currentState` backs on `UpdateService.sys.mjs:4426` (`get currentState()`); `AppUpdater.sys.mjs:271` reads `this.aus.currentState` for `STATE_PENDING` (ready for restart) / `STATE_DOWNLOADING` / `STATE_STAGING`. The shell reads the same accessor through the boundary (new catalogue rows: `Services.obs.addObserver`/`removeObserver` for the observer, `Cc`/`Ci` only as already catalogued — no new import shape beyond what `quitApplication`/`requestRestart` need).

Status mapping (planner binds exact strings; the row asserts the mapping table is total over the four topics):
- `update-staged` / `update-downloaded` → ready (UPD-20 string family).
- `update-available` with `cant-apply` → cannot-update (UPD-21 family; read-only dir).
- `update-error` → could-not-check (UPD-22 family; Check again at most once per session — the once-per-session flag lives in the Theia client, asserted by the copy/behavior row, not by the observer).

## Restart (UPD-19) [VERIFIED: read this session]

`UpdateListener.requestRestart` (lines 161-176) is the shape to copy:
1. `Cc["@mozilla.org/supports-PRBool;1"].createInstance(Ci.nsISupportsPRBool)`, `Services.obs.notifyObservers(cancelQuit, "quit-application-requested", "restart")`.
2. If not cancelled: `Services.startup.quit(eAttemptQuit | eRestart)`.

Both halves already exist in the tree: `quitApplication` (`PowerBrowserAPI.sys.mjs:701-715`) does the same announce-then-quit without `eRestart`. `restartToUpdate` adds the `eRestart` flag on the same path, and the quit flush (`runQuitFlushSync`, line 729) still runs — the layout-restore half of UPD-20 criterion 1. New catalogue rows for `Services.startup.quit` already exist; the `eRestart` constant use is the same touchpoint, not a new internal. `checkForUpdates` triggers `AppUpdateService.checkForBackgroundUpdates` / `downloadUpdate` equivalent through the same service accessor (planner binds the exact call; must be a read-catalogued accessor, no new internal family).

`checkForUpdates` failure → UPD-22 string. At most once per session: the client keeps a session flag; a second failure in the same session reuses the status-bar state without re-showing the prompt. The self-test plants a double-failure sequence in memory.

## Copy ownership (UPD-20/21/22/23/32)

Contracted strings (from REQUIREMENTS.md, verbatim — the copy row derives them from the contribution, these are the seed values):
- UPD-20: "PowerBrowser <version> is ready to install. Restart PowerBrowser to finish updating." + Restart now / Later + status-bar item.
- UPD-21: "PowerBrowser cannot update this copy because its folder is read-only. Unpack PowerBrowser somewhere you own, or install it with your package manager." + Open download page. macOS variant text present: "PowerBrowser cannot update itself from this location. Move PowerBrowser to your Applications folder, then open it again."
- UPD-22: "PowerBrowser could not check for updates. Check your internet connection, then choose Check again." + Check again.
- UPD-23 titles: "PowerBrowser: Restart to Update", "PowerBrowser: Check for Updates".

All six live in the `@powerbrowser/branding` contribution (new file or extension of the existing branding config — planner's choice; one site only). The UPD-32 row derives them and applies the `shell-error-copy-no-internals` shape (ALL_CAPS_TOKEN + DOTTED_KEY + names-PowerBrowser + ends-with-affordance). Its self-test plants a pref key (`app.update.url.manual`-shaped) into one string and requires red naming the string. It also covers TEL-05's title when Phase 53 lands — record the extension point, do not build TEL-05 here.

Status-bar item + notification UI: the Theia side reuses the existing notification/status-bar surfaces (no new package; planner binds exact contribution points). Restart now → `restartToUpdate` request; Later dismisses; the status-bar item re-opens the prompt.

## Hop proof (UPD-24)

`scripts/verify-mar-update-hop.mjs` already proves N→N+1 (distinct versions + buildIDs, byte-identical served descriptor from `buildUpdateXml`, MAR hash/size pin, fork-server access log, zero Mozilla hosts in the resolver log). UPD-24 extends the WebDriver path (the in-Gecko driver the row's evidence procedure uses) to also assert: the ready notification text is shown, clicking Restart now lands version N+1 with the layout restored, and a planted read-only app directory produces the cannot-update message. Plant faults: same-version loop, descriptor mismatch, missing access-log entry (existing) + notification absent, version not N+1 after restart, layout not restored, read-only plant not producing the message (new). Phase 45 packaged re-run is out of scope here (CONTEXT assumption; Phase 50 criterion).

Note on Phase 44 ordering: UPD-14 (`scripts/build-update-xml.mjs` importing `buildUpdateXml`) belongs to Phase 44. If Phase 44 has not landed when Phase 46 executes, UPD-24 uses the in-file generator directly; the plan records the import direction for Phase 44 and does not build `build-update-xml.mjs` here.

## Exposure probe (UPD-27)

`UpdateListener.sys.mjs:288,299` calls `lazy.NimbusFeatures.updatePrompt.recordExposureEvent({ once: true })` on the available and manual paths. With `MOZ_NORMANDY` compiled out (`imply_option("MOZ_NORMANDY", False)`, `powerbrowser/identity.configure.comparand:13`), the probe drives those two paths in-Gecko (fixture update object with `detailsURL`, as the unsupported-notification guard requires) and asserts: the call returned (did not throw) and the layer-3-style resolver observation for the probe window lists no network request. Full-tier evidence; the quick self-test drives the same assertion against a fixture `NimbusFeatures` double (throwing double → red; recording double → red; silent double → green). Never an absence-of-own-log assertion.

## Egress pass (UPD-15) [VERIFIED: allowlist read this session]

Current state: 29 hosts. `powerbrowser.org` + `github.com` already `user-initiated` (UPD-33). No `release-assets.githubusercontent.com` row. No `crash-reports.mozilla.com` row. `location.services.mozilla.com` is `deny` with a reason that conflates region-lookup and geolocation.

Edits (one plan, one commit with the doc-consistency row green):
1. `release-assets.githubusercontent.com` — disposition `allow`, reason: layer-3 observation of a real update's asset download (Phase 40's `user-initiated` pattern for click destinations does not apply: the updater fetches MAR bytes unattended after staging). Live observation recorded at Phase 50 criterion 5; the row lands now with the stated reason and the Phase 50 observation reference. `github.com` row keeps `user-initiated` (click destinations only).
2. `crash-reports.mozilla.com` — disposition `deny`, reason: crash reporter compiled out (`--disable-crashreporter`, decision 9); the host must never be contacted. Pairs with the `breakpad.reportURL` blanked pref expect (already present).
3. Geolocation row correction: split the conflated reason — `browser.region.network.url` blanked (unattended region lookup, deny stands) vs `geo.provider.network.url` deliberately untouched (fires only on explicit site request, real capability). UPD-27-style: no new pref change, a reason-text correction so the next reader does not "fix" the wrong pref.
4. Stale texts: `firefox-branding.js:131-132` comment scope (region/Push) and `endpoint-allowlist.json:22` UPD-12 reason (Phase 40 changed the comparand; verify the text matches the landed wording).
5. Mozilla allow-host rule: any Mozilla host this pass dispositions `allow` is named in REQUIREMENTS.md "Inherited network egress" + workstream ROADMAP.md in the same commit (`allowlist-doc-consistency` enforces). This pass adds no Mozilla allow host (asset host is GitHub-owned; crash host is deny), so the sections are verified unchanged — the plan asserts that explicitly.
6. Partner search codes under `org.debios`: inspected this session — no `distribution/` search engine config, no partner-code pref, no `org.debios` string anywhere in `powerbrowser/` or `scripts/`; upstream default partner machinery (`ConfigSearchEngine.sys.mjs` `partnerCode`, `browser.partnerlink.*` prefs) is untouched stock. Status recorded in the plan output + `docs/RELEASING.md` release-notes source note: stock partner codes retained, no custom code, no search-host allowlist change. If a live Suggest-traffic observation is wanted, it is Phase 50 criterion 5 alongside the asset hosts — not a new row here.

## FxA/Sync off (UPD-28)

Decision 6: generated branding prefs set `identity.fxaccounts.enabled=false`. The emitter addition follows the `mozillaEndpointPrefs` pattern (`scripts/generate.mjs:2638`); `verify-update-prefs.mjs`-style row or an extension of `update-prefs` asserts the pref is false in both variants, self-test plants `true`/absent → red. The verify-endpoints run (full tier) then lists contacted hosts; the FxA/Sync family (`accounts.firefox.com`, `sync*.mozilla.com`, `firefoxaccounts` hosts — planner derives the exact set from the tree at check time, never a hand list) must be absent from the derived contacted-host list. Positive-signal form: the capture lists what it did contact; the assertion is set-difference, not log-absence.

## Sidecar egress open item (carried)

SUMMARY's "sidecar egress vs verify-endpoints layer 3" stays open: the sidecar's Open VSX / AI hosts are `user-initiated` + `allow` today, and a full layer-3 capture of an update flow that also exercises the sidecar has never been run. Phase 46 records the capture procedure for the Phase 50 live release (which runs the real hop with the sidecar up); no new row here beyond the UPD-15 edits above.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Update staging/download state | A Theia-side state machine | Observe the four service topics + `currentState` | The service is the truth; a second machine drifts from it |
| Restart | A new quit path | `requestRestart` shape: announce `quit-application-requested` w/ `restart`, then `eAttemptQuit \| eRestart` | Same observers (flush, leave prompts) run; layout restores |
| Update strings | Literals in the client | `@powerbrowser/branding` contribution, derived by the copy row | One site; the row goes red on drift, addition, or removal |
| Kind agreement | A hand list in the row | Set equality of accepted vs dispatched kinds, derived at check time | Goes red on addition AND removal |
| Host expectations | A hand list of FxA/Sync or Mozilla hosts in the row | Derive the contacted set from the capture; assert set-difference | A hand list agrees only with the tree it was copied from |
| Descriptor format | A hand-written update.xml | `buildUpdateXml` (in-file until Phase 44 lands the importer) | Byte-identical regeneration is the proof |

## Package Legitimacy Audit

No npm, PyPI or crates package is installed by this phase. `js-yaml`/Node/test harnesses follow the Phase 41 precedent (already in tree). If the planner wants a WebDriver client beyond what the hop row already uses, it must reuse the row's existing driver — no new dependency.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Common Pitfalls

### Pitfall 1: Observing from the wrong process
**What goes wrong:** the observer is registered where the update service never notifies (content process), so the push never fires and the row goes green-by-absence.
**How to avoid:** register in the parent (boundary file, chrome side) exactly where `UpdateListener` observes; the hop row's ready-notification assertion is a positive signal (notification shown), never an absence assertion.

### Pitfall 2: Restart that skips the flush
**What goes wrong:** `restartToUpdate` quits without the `quit-application-requested` announce, so the layout flush never runs and the N+1 launch loses the session layout.
**How to avoid:** copy `requestRestart` exactly (announce first, `eRestart` second); the hop row asserts layout restoration after restart.

### Pitfall 3: `cant-apply` subject is null
**What goes wrong:** `update-available` with `cant-apply` notifies with subject `null` (UpdateService.sys.mjs:3972); a `QueryInterface` on it throws and the cannot-update message never shows.
**How to avoid:** null-guard before touching the subject; the read-only plant in the hop row exercises exactly this path.

### Pitfall 4: Copy row that checks literals
**What goes wrong:** a banned-string list agrees only with the tree it was copied from; next year's string drifts past it.
**How to avoid:** derive from the contribution + shape test (UPD-32), the `shell-error-copy-no-internals` precedent with its enumeration-completeness rule.

### Pitfall 5: Allowlist edit without doc-consistency
**What goes wrong:** a new allow host without the REQUIREMENTS/ROADMAP naming fails `allowlist-doc-consistency` at the next commit.
**How to avoid:** the UPD-15 plan asserts doc-consistency green in the same commit; this pass adds no Mozilla allow host, recorded explicitly.

## Code Examples

### Observer registration (boundary file shape)
```js
// PowerBrowserAPI.sys.mjs: one observer, four topics, same wall as handleShellMessage (chrome-side only).
const UPDATE_TOPICS = ["update-available", "update-staged", "update-downloaded", "update-error"];
function onUpdateNotification(subject, topic, data) {
  // null-guard: cant-apply notifies with subject null.
  let version = "";
  try {
    const update = subject ? subject.QueryInterface(Ci.nsIUpdate) : null;
    version = update ? (update.displayVersion || update.version || "") : "";
  } catch { version = ""; }
  pushAppUpdate({ status: topicStatus(topic, data), version });
}
for (const t of UPDATE_TOPICS) Services.obs.addObserver({ observe: onUpdateNotification }, t, false);
// Removal on shutdown: Services.obs.removeObserver per topic (catalogue each line).
```

### Push over the existing channel
```js
// Same sendAsyncMessage the flush path uses (PowerBrowserAPI.sys.mjs:2290):
theiaBrowser.browsingContext.currentWindowGlobal
  .getActor(GROUP_ACTOR_NAME)
  .sendAsyncMessage("PowerBrowserWebTabState", { kind: "appUpdate", status, version });
```

### Restart (UpdateListener.shape, upstream lines 161-176)
```js
const cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].createInstance(Ci.nsISupportsPRBool);
Services.obs.notifyObservers(cancelQuit, "quit-application-requested", "restart");
if (!cancelQuit.data) Services.startup.quit(Services.startup.eAttemptQuit | Services.startup.eRestart);
```

## Open Questions

1. **Phase 45 packaged re-run (assumption, not a question):** the hop row's packaged evidence needs the Phase 45 tarball+MAR. Recorded in CONTEXT; Phase 50 criterion. No owner action.
2. **Phase 44 `build-update-xml.mjs` ordering:** if Phase 44 has not landed, UPD-24 uses the in-file `buildUpdateXml` and records the import direction. No owner action.
3. **Live asset-host layer-3 observation:** needs a real Release (Phase 50 criterion 5). No owner action in this phase.

## Sources

### Primary (HIGH)
- Tree: `powerbrowser/shell/PowerBrowserAPI.sys.mjs:295` (kinds), `:701-715` (quit), `:729-743` (flush), `:2217-2277` (dispatch), `:3666-3677` (routing); `theia/extensions/tab-uris/src/browser/profile-storage.ts` (request/reply), `browser-window-command.ts` (palette pattern); `scripts/verify-mar-update-hop.mjs` (`buildUpdateXml`); `scripts/verify-shell-error-copy.mjs` (shape test); `powerbrowser/endpoint-allowlist.json` (29 hosts); `scripts/generate.mjs:2638` (`mozillaEndpointPrefs`).
- Upstream (read-only, never edited): `toolkit/mozapps/update/UpdateService.sys.mjs:3958-4000,5178-5181,7210-7318` (notify sites), `:4426` (`currentState`); `toolkit/mozapps/update/UpdateListener.sys.mjs:161-176` (restart), `:288,299` (exposure), `:497-530` (observe); `toolkit/mozapps/update/AppUpdater.sys.mjs:271-273` (`currentState` read).

### Secondary (MEDIUM)
- `.planning/research/v1.6-deploy/SUMMARY.md` Phase C + `ARCHITECTURE.md`; workstream ROADMAP.md Phase 46 + REQUIREMENTS.md UPD-15/18-28.
