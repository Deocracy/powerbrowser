# Phase 39: v1.5 Close-out - Pattern Map

**Mapped:** 2026-11-05
**Files analyzed:** 14 (all modified except new UAT rows/scenarios inside existing files)
**Analogs found:** 14 / 14
All analog paths verified git-tracked (`git ls-files`); none is an objdir or capability mirror.

## File Classification

| Modified file | Role | Data flow | Closest analog | Match |
|---|---|---|---|---|
| `scripts/verify-page-furniture-live.mjs` (C11 plant `stale-dismiss-focus`, drop `focusTheiaFrame` in `closeMenu`, C24 wl-paste check) | test (live harness) | request-response | itself, `PLANTS` table at 2177 + `applyMenuPlants` at 744 | exact |
| `scripts/verify-new-window-adopt-live.mjs` (999.11) | test | request-response | same file `PLANTS` at ~756 | exact |
| `scripts/verify-prompts-live.mjs` (999.13, 999.14) | test | request-response | same file `kwinShot` ~775-782 | exact |
| `scripts/verify-address-bar-live.mjs` (999.4), `verify-nav-keys-live.mjs` (999.5), mode-tokens (999.6) | test | request-response | `verify-page-furniture-live.mjs` plant shape | role-match |
| `scripts/verify-ext-tab-host-patch-guards.mjs` (G14/G15 rows) | test (static guard) | transform | rows G12/G13 (lines 120-143) + WEAKEN (144-157) + EXEMPT (164) | exact |
| `patches/050-extension-tab-host.patch` | config (patch) | transform | `scripts/regenerate-patches.sh`, CLAUDE.md patch rule | exact |
| `theia/extensions/chrome-bar/src/browser/page-context-menu.ts` (C11) | component (contribution) | event-driven | itself, `open()` 108-135, `settle()` 237-261 | exact |
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` (C22/C23/C24, furniture section) | service (boundary) | event-driven | `installTooltipsAndLinkStatus` (8200+), `showTooltip` 8262-8273, `installShellFurnitureReceivers` 8167-8181 | exact |
| `powerbrowser/INTERNAL-APIS.md` | config (catalogue) | transform | existing rows; `check-internals-boundary.sh --catalogue` | exact |
| `.planning/phases/34-*/34-UAT.md` (rewrite) | doc | transform | `.planning/phases/33-bookmarks-history-and-the-full-menu/33-UAT.md` | exact |
| `.planning/phases/{27,31.1,32..38}-*-UAT.md` | doc | transform | same 33-UAT.md | exact |
| `.planning/WINDOWS.md` | doc (ledger) | CRUD | its own table rows | exact |
| `.planning/ROADMAP.md` (backlog rows, ticks) | doc | CRUD | Phase 999.10 / 999.11 blocks (~733-748) | exact |
| `.planning/REQUIREMENTS.md`, `scripts/verify-platform.sh` registry row | doc / config | CRUD | existing rows | exact |

## Pattern Assignments

### Live harness plant (any `verify-*-live.mjs`)

**Analog:** `scripts/verify-page-furniture-live.mjs`

Plant table row (line 2177 onward). `expect` must be a string only the planted failure emits:
```js
const PLANTS = [
    { plant: 'tooltip-element-removed', target: 'tooltip-status', run: ['tooltip-status'], expect: 'page tooltip did not open' },
    { plant: 'background-check-off', target: 'background-menu', run: ['context-menu', 'background-menu'], expect: 'a hidden tab opened a menu' },
```
Plant application (744-760): a runtime mutation in chrome scope, noted only after read-back (header 131-133: "notes `PLANT <name> applied` only after reading the mutation back"):
```js
async function applyMenuPlants(app, plant, note) {
    if (plant === 'stub-removed') {
        if (await inChrome(app, `document.getElementById('contentAreaContextMenu')?.remove(); return document.getElementById('contentAreaContextMenu') === null;`) === true) {
            note('PLANT stub-removed applied');
        }
    }
```
New plant `stale-dismiss-focus` (C11) goes here: restore the unconditional `widget.focusPage()` and require red on a second menu opened within the first dismissal's round trip. Then delete `await focusTheiaFrame(app);` from `closeMenu` (672-681), whose comment names this race.

**Fix for 999.11** (`verify-new-window-adopt-live.mjs` ~758): change `expect: 'opener'` to `expect: 'window.opener is null'` (real failure string at `:423`). Do not loosen strings elsewhere.

**Fix for 999.14** (`verify-prompts-live.mjs` ~775-780): current shape to replace:
```js
writeFileSync(script, "for (const w of workspace.windowList()) { if (String(w.resourceClass).toLowerCase().includes('powerbrowser')) workspace.activeWindow = w; }\n");
const id = execFileSync('qdbus', ['org.kde.KWin','/Scripting','org.kde.kwin.Scripting.loadScript', script], ...).trim();
execFileSync('qdbus', ['org.kde.KWin', `/Scripting/Script${id}`, 'org.kde.kwin.Script.run'], ...);
execFileSync('spectacle', ['-b', '-n', '-f', '-o', out], { timeout: 20000 });
```
Gap: no wait between raise and capture, `-f` is full desktop. Use `-a`, poll active window, add self-test plant making the raise a no-op that must refuse the capture.

**Instrument-failure convention:** failures that are instrument defects use the `BROKEN` prefix (`${BROKEN} no ${selector} in the page`, line ~662); `assertCleanTree()` (`scripts/lib/ng-a-live.mjs:60-69`) refuses dirty tracked trees: commit planning files first.

---

### `scripts/verify-ext-tab-host-patch-guards.mjs` (G14, G15 for 999.15/999.16)

**Analog:** rows G12/G13 (lines 120-143), WEAKEN (144-157). A row has `id, file, mode ('before'|'after'|'replace'), anchor, site, regexes[], why`:
```js
{ id: 'G13', file: WINDOWS, mode: 'before',
  anchor: 'window.close();', site: 'getAPI.remove',
  regexes: [
    /^\s*if \(windowTracker\.isTabHostWindow\(window\)\) \{\s*$/,
    ...
  ],
  why: 'windows.remove refuses a tab host window: ... (UF-31.1-01, plan 38-06)' },
```
Every row needs a WEAKEN entry (`{ find, replace }` or `{ drop: /re/ }`), e.g.:
```js
G13: { find: 'if (windowTracker.isTabHostWindow(window)) {', replace: 'if (!windowTracker.isTabHostWindow(window)) {' },
```
Needed constants: add file constants beside `PAGE_ACTION/BROWSER/WINDOWS/PARENT` (declared above line 68) for `ExtensionParent.sys.mjs` and `EnterprisePoliciesParent.sys.mjs`. Coverage phase (527-550) fails `UNCOVERED` on any added hunk with no row, so both hunks need rows or EXEMPT entries (`{file, needle, reason}`). The `--self-test` (655-730) loops all GUARDS with removed/weakened/misplaced plants automatically; add hand-written plants only for special cases (see G9/G10 at 718-728).

**Patch regeneration** (CLAUDE.md "Patches are regenerated, never text-edited"): edit `upstream/`, `git -C upstream add`, produce sections with the pinned git flags used by `scripts/regenerate-patches.sh`, append to 050, then `scripts/regenerate-patches.sh --check` must PASS and `scripts/apply-patches.sh` must print "applied and verified non-vacuous". Re-stamp: `sha256sum patches/050-extension-tab-host.patch > objdir/.pb-050-build.sha256` (objdir is untracked, record in SUMMARY). Update the BUILD.md 050 bullet text.

---

### `theia/extensions/chrome-bar/src/browser/page-context-menu.ts` (C11)

**Analog:** itself. No separate latest-id guard exists elsewhere in the extension, so add one field. Race sites:

`open()` (110-130):
```ts
const { tabId, menuId, x, y } = detail;
...
const pick = (itemId: string | null): void => {
    if (!sent) {
        sent = true;
        void this.send(tabId, menuId, itemId).then(reply => this.settle(widget, tabId, menuId, itemId, reply)).catch(() => {
            if (itemId !== null) {
                this.messages.error(CHROME_BAR_COPY.pageMenuRowRefused(appSubject()));
            }
            widget.focusPage();
        });
```
`settle()` ends (260): `widget.focusPage();` after the early `return`s for `keepsFocus` and `grant` background false.

Fix shape: `protected latestMenuId = -1;` set to `menuId` at the top of `open()` after validation; in the `.catch` and at the end of `settle`, call `widget.focusPage()` only if `menuId === this.latestMenuId`. Keep the error toast independent of the guard. Imports unchanged (menu id is already a number from the push).

---

### `powerbrowser/shell/PowerBrowserAPI.sys.mjs` (C22 tooltip, C23 popup, C24 copy image)

**Analog:** the furniture section at end of file. Entry and isolation pattern (8167-8181):
```js
const step = (name, install) => {
  try { install(); } catch (err) {
    PowerBrowserAPI.log("error", `[furniture] ${name} failed (${err && err.name ? err.name : "error"})`);
  }
};
step("tooltips", () => installTooltipsAndLinkStatus(window));
step("page menu", () => installPageContextMenu(window));
```
Tooltip receiver (8262-8273):
```js
showTooltip(x, y, text, direction, browser) {
  if (Cc["@mozilla.org/widget/dragservice;1"].getService(Ci.nsIDragService).getCurrentSession()) return;
  if (!document.hasFocus() || tabIdOfBrowser(browser) === null) return;
  const tooltip = document.getElementById("remoteBrowserTooltip");
  tooltip.label = text; tooltip.style.direction = direction;
  tooltip.openPopupAtScreen(x / window.devicePixelRatio, y / window.devicePixelRatio, false, null);
},
```
Copy Image runs through `pageMenuEdit` (`~8977-8984`, Controllers actor). Rules for any edit: stay inside the furniture section (header says nothing above the last catalogued internals line moves), no new Firefox-internal import outside this file, re-run `scripts/check-internals-boundary.sh --catalogue`, add INTERNAL-APIS.md rows for any new internal. Diagnose first from the harness (`inChrome`/`probe` wrappers), never ship diagnostics in the product (RESEARCH Pattern 2). For C24 run `wl-paste --list-types` after the Copy Image pick before touching product code.

---

### `.planning/phases/34-*/34-UAT.md` and other UAT files

**Analog:** `.planning/phases/33-bookmarks-history-and-the-full-menu/33-UAT.md`. Exact shape (frontmatter lines 1-7, then sections):
```markdown
---
status: partial
phase: 33-bookmarks-history-and-the-full-menu
source: [33-VERIFICATION.md]
started: 2026-11-01T00:00:00Z
updated: 2026-11-05T01:52:09.664Z
---
## Current Test
[testing complete]

## Tests

### 1. Bookmark star, editor and Ctrl+D (SC1)
expected: `node scripts/verify-address-bar-live.mjs --scenario ...` passes. ...
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: ... PASS"

### 6. PAGE-09 Edit menu greying (manual, no scenario exists)
expected: ...
result: [pending]

## Summary
total: 7
passed: 5
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
## Deferred Follow-Ups
```
34-UAT.md needs: a single `## Tests` section with all 15 rows as `### N. Name` / `expected:` / `result:`; `## Summary` counts must equal row counts; `skipped` rows need `reason:`; live half recorded as `evidence:`, by-hand remainder as `[pending]` (35-UAT `live:` form). `uat.complete-session` reads only `## Tests` (`~/.claude/gsd-core/bin/lib/uat.cjs:503-570`).

---

### `.planning/ROADMAP.md` backlog row and `.planning/WINDOWS.md` ledger entry

ROADMAP backlog block (analog Phase 999.10 / 999.11, lines ~733-747):
```markdown
### Phase 999.N: Follow-up — Phase NN deferred UAT follow-up: Test T (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase NN verification
**Source phase:** NN
**Deferred at:** <date> during /gsd-verify-work NN session completion
**Follow-ups:**
- [ ] Test T: <repro, cause so far> (deferred <date>)
```
Tick fixed rows `- [x]`; the Phase 39 list row is at line 135, scope at 588-594.

WINDOWS.md: YAML header (`open_count/waived_count/fixed_count/total_count/last_updated`) plus a table row `| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |`. Do not hand-edit counts: use `gsd-tools windows waive|fixed <id>` (header text, lines 11-13) so the counters stay consistent. Deferral entries must carry repro, cause-so-far and source UAT test in `description`.

---

### `scripts/verify-platform.sh` registry

Append one row beside the existing `*-live` and `*-self-test` rows (never a sibling driver). Any new check needs a `--self-test` planting faults that each go red naming the drift. Open Question 1 (derived skip for `dialog`/`dialog-probe` while PROMPT-03 is deferred; `--gate` exclusion needs an open WINDOWS id in `GATE_KNOWN_OPEN_EXCLUSIONS`) must be settled before planning promises a green gate.

## Shared Patterns

### Commit and tree hygiene
**Source:** CLAUDE.md, memory `concurrent-sessions-on-main`
**Apply to:** every plan. Commit with explicit paths; stage new files before `node scripts/scan-brand-residue.mjs`; commit planning edits before live runs (`assertCleanTree`).

### Live-run safety
**Source:** RESEARCH Pitfalls 1-3, 5
**Apply to:** harness plans. Never call `--help` on `verify-ext-tab-host-live.mjs`, `verify-extension-actions-live.mjs`, `verify-extension-amo-live.mjs` (they launch sessions). 050/060 stamps must match patches. Verify the active window is `powerbrowser` before any ydotool input.

### Plant discipline
**Source:** CLAUDE.md Verification rules 1-2
**Apply to:** all new/changed scenarios. Each fix flips a named plant red to green; derive expectations from the tree; no absence-of-log assertions over self-emitted lines.

## No Analog Found

| File | Role | Data flow | Reason |
|---|---|---|---|
| Vaultwarden EXT-10 mode (Plan F) | test | request-response | No local server fixture exists; `scripts/lib/pb-extension-fixtures.mjs` and `verify-extension-amo-live.mjs` are the nearest, use RESEARCH Plan F |
| ydotool real-input rows (Plan E) | test | event-driven | No ydotool use in tree; pattern is RESEARCH Pitfall 5 |
| Latest-id guard elsewhere in chrome-bar | component | event-driven | Not searched exhaustively beyond page-context-menu.ts; add the field locally |

## Metadata

**Analog search scope:** `scripts/`, `theia/extensions/chrome-bar/src/browser/`, `powerbrowser/shell/`, `.planning/` (phase 33 UAT, ROADMAP, WINDOWS).
**Pattern extraction date:** 2026-11-05
**Not checked:** `regenerate-patches.sh` internals, `verify-platform.sh` row syntax, 999.4/999.6 scenario code (RESEARCH has the line anchors), graph MCP tools (grep/read used).
