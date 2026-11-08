---
phase: 31-site-identity-permissions-and-app-menu
plan: 05
subsystem: ui
tags: [quit, quitRequest, store-kind, lifecycle, ctrl-q, reserved-key, app-menu, theia, chrome-bar, live-gate]

# Dependency graph
requires:
  - phase: 31-site-identity-permissions-and-app-menu
    plan: 04
    provides: [application menu with a disabled Quit row, openStockPage kind, store-write class, app-menu live scenario]
provides:
  - quitRequest store kind (no argument; chrome arm calls the one quitApplication())
  - lifecycle store class in rule 12 (a new class: chrome-lifetime transition, never relayed, sent only from the widget and the client)
  - ChromeStoreClient.quitRequest() (resolves applied or cancelled)
  - Ctrl+Q as one chrome-reserved <key> row in powerbrowser.js, with no Theia keybinding
  - Quit menu row enabled and wired through quitRequest
  - quit-key and quit-row live scenarios (each alone in its own launch) with the quit flush and exit status checks

# Actuals — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 12172    # chars/4 over the added lines of the code commits (git diff 0a62da4..61c8f44, powerbrowser/theia/scripts; 48688 characters, which includes 205 remapped INTERNAL-APIS.md references)
  tasks: 2
  commits: 3       # MEASURED: git rev-list --count 0a62da4..HEAD at SUMMARY write (the plan-start base, recorded in .git/gsd-plan-head-before-31-05 before the first commit); the docs commit is not counted, as in 31-01..04
  plan_head_before: 0a62da4d5a0d7786bddb2ccba5be16840bbfe705
  plan_head_after: 61c8f448634dee9fb13065d875b60da739c4d4e2

# Tech tracking
tech-stack:
  added: []
  patterns: [store kind with no argument whose chrome arm is one call to the existing path, lifecycle class enforced by a set-equality relay absence and a caller allow-list, chrome-reserved key row with a derived mirror of Firefox's key, quit observed by exit status plus a file the quit path itself writes (the flush), one live launch per quit]

key-files:
  created:
    - .planning/phases/31-site-identity-permissions-and-app-menu/31-05-SUMMARY.md
    - .planning/phases/31-site-identity-permissions-and-app-menu/31-05-LIVE-HANDOFF.md
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/shell/powerbrowser.js
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/tab-uris/src/browser/chrome-store-client.ts
    - theia/extensions/chrome-bar/src/browser/site-identity/app-menu.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - scripts/verify-web-tab-bridge.mjs
    - scripts/verify-shortcut-relay.mjs
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-site-identity.mjs
    - scripts/verify-site-identity-live.mjs
    - scripts/verify-platform.sh
    - scripts/lib/firefox-bidi.mjs
    - scripts/lib/pb-relaunch.mjs
    - scripts/lib/pb-live-probe.mjs

key-decisions:
  - "quitRequest carries no argument (the plan's `quitRequest {}`; CONTEXT's `{page}` is superseded). The arm reads nothing from the sender; the sender wall in handleStoreRequest (PowerBrowserAPI.sys.mjs:4065 refusal, the shell-frame check above it) admits only the Theia shell frame."
  - "A cancelled quit is an answer. The arm replies {ok:false, reason:'cancelled'} when quitApplication() returns false (a quit-requested observer declined), and the client resolves 'cancelled'. Upstream: cmd_quitApplication -> goQuitApplication (browser-sets.js:103-105) runs the same quit-requested announcement, so a page's leave prompt cancels there too."
  - "Ctrl+Q is a chrome <key> row (powerbrowser.js:327-335), not a PAGE_KEYS row: it has no relay action and is never disabled. It mirrors Firefox's key_quitApplication (browser-sets.inc.xhtml:352-366; Linux accel, reserved). The shell window (powerbrowser.xhtml) includes no browser-sets.inc.xhtml, so this row is the only Ctrl+Q in the shell."
  - "The lifecycle class is new in rule 12 (verify-web-tab-bridge.mjs:106, :128). A lifecycle kind is never relayed and is called only from the client and chrome-bar-widget.tsx; a command or keybinding that names it goes red."
  - "The Quit row's Ctrl+Q badge is text in the label (`Quit PowerBrowser (Ctrl+Q)`, chrome-bar-copy.ts:129), not a Theia accelerator. Theia draws a menu accelerator only from a KeybindingRegistry binding (@theia/core action-menu-node.js getAccelerator), and that binding would also register a Phosphor key binding on .p-Widget, which is the Theia-side Ctrl+Q this plan forbids. The label is checked against the derived key label by verify-shortcut-relay.mjs rule 11."
  - "The UI-SPEC sentence names the badge (`Quit {App}` with `Ctrl+Q` badge). verify-site-identity.mjs compares the row name with the sentence and requires the Quit label to carry that badge; a dropped badge goes red."
  - "A quit ends the launch, so quit-key and quit-row are scenarios of their own, each in its own session (main and selfTest run them alone). The app-menu scenario keeps the menu checks and reads Quit as enabled (step 3); it does not click Quit."
  - "The quit flush is the same-launch mark: quit-application-granted runs saveWebTabHistories (PowerBrowserAPI.sys.mjs:770), which writes powerbrowser-web-tab-history.json into the profile. A fresh probe profile has no such file before a quit (checked before the key or click), so its presence after the exit proves the flush ran."
  - "Quit confirm: none. UI-SPEC.md:117 says quit is immediate. The live dirty-editor fixture (an untitled editor with an unsaved change, read dirty before the quit) did not stop the exit; no prompt appeared."

# Coverage: the plan's must-haves as shipped
coverage:
  - id: Q1
    description: "Ctrl+Q quits through the one existing quit path (quitApplication), with the Theia frame focused"
    requirement: "MENU-04"
    verification:
      - kind: e2e
        ref: "node scripts/verify-site-identity-live.mjs --scenario quit-key (exit within 15 s, status 0, flush file present, dirty editor read dirty, Theia frame focused first)"
        status: pass
      - kind: unit
        ref: "node scripts/verify-shortcut-relay.mjs --self-test (ctrl-q-unreserved, ctrl-q-no-quit-call, ctrl-q-theia-binding, quit-badge-drift)"
        status: pass
  - id: Q2
    description: "The menu Quit row is enabled, sends quitRequest from its own handler, and its click quits through the same path"
    requirement: "MENU-04"
    verification:
      - kind: e2e
        ref: "node scripts/verify-site-identity-live.mjs --scenario quit-row (row read enabled; click; exit 0; flush file present)"
        status: pass
      - kind: e2e
        ref: "node scripts/verify-site-identity-live.mjs --scenario app-menu (step 3: Quit row read enabled, rows and separators unchanged)"
        status: pass
      - kind: unit
        ref: "node scripts/verify-site-identity.mjs (cases: the Quit row sends quitRequest from its own handler; wired rows; UI-SPEC badge; plants quit wired without its client method, quit unwired though its kind exists, Quit row sends nothing, Quit badge dropped)"
        status: pass
  - id: Q3
    description: "quitRequest is a store kind with a chrome arm, a lifecycle class (never relayed, sent only from the widget and the client), and a client method"
    requirement: "MENU-04"
    verification:
      - kind: unit
        ref: "node scripts/verify-web-tab-bridge.mjs and --self-test (planted unclassified quitRequest, quitRequest in the backend relay, quitRequest without its client method, lifecycle call from chrome-bar-commands.ts, lifecycle kind named in chrome-bar-keybindings.ts)"
        status: pass
  - id: Q4
    description: "No second quit path and no Theia Ctrl+Q binding"
    requirement: "MENU-04"
    verification:
      - kind: unit
        ref: "node scripts/verify-site-identity.mjs (case: one quit path, Services.startup.quit spelled only by PowerBrowserAPI.sys.mjs across powerbrowser/shell and theia/extensions/*/src; plant quit-second-path)"
        status: pass
      - kind: unit
        ref: "node scripts/verify-shortcut-relay.mjs (rule 11: no accel+Q row in PAGE_KEYS or PAGE_SHORTCUTS, no ctrl+q or ctrlcmd+q in chrome-bar-keybindings.ts)"
        status: pass
  - id: Q5
    description: "Phase close: the full live run of every scenario, both live self-tests, --quick, and regression of the key checks"
    requirement: "MENU-04"
    verification:
      - kind: e2e
        ref: "node scripts/verify-site-identity-live.mjs (identity-tls, site-panel, identity-local, clear-data, shield, app-menu, quit-key, quit-row: all PASS, exit 0)"
        status: pass
      - kind: e2e
        ref: "node scripts/verify-site-identity-live.mjs --self-test (clean controls green for eight sessions; eight plants red, named below)"
        status: pass
      - kind: e2e
        ref: "scripts/verify-platform.sh --only nav-keys-live and --only nav-keys-live-self-test (PASS)"
        status: pass
---

# 31-05 Summary — quit (MENU-04) and phase close

## Accomplishments

- `quitRequest` store kind: joins `STORE_REQUEST_KINDS` (`PowerBrowserAPI.sys.mjs:4032`); the
  arm (`:4140`) calls `PowerBrowserAPI.quitApplication()` and replies `{ok:true, where:'applied'}`,
  or `{ok:false, reason:'cancelled'}` when an observer declined. No argument is read.
- Rule 12 (`scripts/verify-web-tab-bridge.mjs`): `lifecycle` added to `STORE_KIND_CLASS_NAMES`
  (`:106`); `quitRequest` classed `lifecycle` (`:128`); the relay-absence check covers lifecycle
  (a lifecycle kind in `TAB_STORE_RELAY_KINDS` goes red); a caller allow-list for lifecycle kinds
  (the client and `chrome-bar-widget.tsx`); five planted faults.
- `ChromeStoreClient.quitRequest()` (`chrome-store-client.ts:223`): resolves `applied` or `cancelled`.
- Ctrl+Q: one chrome-reserved `<key>` row in `powerbrowser.js` (`:327-335`), `QUIT_KEY` literal
  first. The command calls `quitApplication()`. Not disabled, not relayed, no Theia keybinding.
- Quit row: `WIRED_MENU_IDS` gains `quit` (`app-menu.ts:25`); the widget's Quit arm
  (`chrome-bar-widget.tsx:452`) calls `quitApplicationRow()` (`:465`), which sends `quitRequest`.
  Copy `menuQuit` (`chrome-bar-copy.ts:129`) is `Quit ${subject} (Ctrl+Q)`; the copy gate pins the
  string (`verify-shell-error-copy.mjs`, EXPECTED_NAV_COPY).
- `INTERNAL-APIS.md`: the 205 line references were remapped by a line diff against HEAD
  (`PowerBrowserAPI.sys.mjs` lines 4032-4135 shift by +1, 4136 onward by +10); no `--fix`. The
  `Services.startup.quit` row now names every caller of `quitApplication()`.
- Static gates: `verify-site-identity.mjs` gains the quit cases (one quit path over the tree, the
  Quit row handler, the UI-SPEC badge) and plants (40 planted faults in `--self-test`).
  `verify-shortcut-relay.mjs` gains rule 11 and four plants (19 in `--self-test`).
- Live: `quit-key` and `quit-row` scenarios (`verify-site-identity-live.mjs:1201-1288`), the
  `quit-dead-row` plant, and the app-menu step 3 change. The probe libraries gained the child's
  exit status (`firefox-bidi.mjs`), an `awaitExit` helper that `quit()` also uses, and
  `app.profileDir` (`pb-relaunch.mjs`, `pb-live-probe.mjs`).

## Commits

Plan 31-05 commits, oldest first (`git log --oneline 0a62da4..61c8f44`):

- `408d437` feat(31-05): quitRequest store kind; the Quit row reaches chrome's one quit path
- `021a38e` feat(31-05): Ctrl+Q is the chrome-reserved quit row, the one Ctrl+Q binding
- `61c8f44` test(31-05): live quit checks: Ctrl+Q and the Quit row, each in its own launch

The docs commit that carries this file and the live handoff is not counted, as in 31-01..04.

## Static results

- `node scripts/verify-web-tab-bridge.mjs` and `--self-test`: PASS (32 planted faults red)
- `node scripts/verify-shortcut-relay.mjs` and `--self-test`: PASS (19 plants red, incl. `ctrl-q-unreserved`)
- `node scripts/verify-site-identity.mjs` and `--self-test`: PASS (31 cases; 40 planted faults red)
- `node scripts/verify-shell-error-copy.mjs`: PASS
- `node scripts/verify-ng-040-internals-catalogue-lines.mjs`: PASS
- `bash scripts/check-internals-boundary.sh` and `--catalogue`: PASS
- `node --check powerbrowser/shell/powerbrowser.js`: exit 0
- `theia/node_modules/.bin/tsc -b theia/extensions/tab-uris` and `tsc --noEmit -p theia/extensions/chrome-bar`: exit 0
- `node scripts/scan-brand-residue.mjs`: PASS (394 files, before the docs commit)
- `scripts/verify-platform.sh --only shortcut-relay`, `shortcut-relay-self-test`,
  `gui02-web-tab-bridge`, `shell-error-copy-no-internals`: each PASS
- `scripts/verify-platform.sh --quick`: PASS (exit 0)

## Live results

Theia built with `nix develop .#theia --command bash -c 'cd theia && yarn build'`, exit 0, 0 errors
(`Finished with 0 errors` for the browser and node builds). The Theia source last changed before
the build (`408d437`); the chrome JS and the scripts changed after it, and the chrome JS is read
from the tree with the startup cache purged by the harness (`MOZ_PURGE_CACHES=1`).

- `app-menu: PASS`. Step 1: the mode segments, the rows in Firefox order with the copy labels
  (`Quit PowerBrowser (Ctrl+Q)` last), the drawn separators, all rows enabled. Step 2: Settings,
  Passwords, Add-ons, Help each open one stock window with one tab on the page; the web tab's
  address is unchanged. Step 3: the Quit row reads enabled.
- `quit-key: PASS`. Ctrl+Q pressed through the probe's parent key route (`tip`) with the Theia
  frame focused and an untitled editor with an unsaved change open (read `dirty`). The browser
  exited within 15 s with status 0; `powerbrowser-web-tab-history.json` was written into the
  probe's profile (absent before the key).
- `quit-row: PASS`. The Quit row read enabled, a click on it (`Quit PowerBrowser (Ctrl+Q)`) exited
  the browser within 15 s with status 0; the flush file was written.
- Full run `node scripts/verify-site-identity-live.mjs`: `identity-tls: PASS`, `site-panel: PASS`,
  `identity-local: PASS`, `clear-data: PASS`, `shield: PASS`, `app-menu: PASS`, `quit-key: PASS`,
  `quit-row: PASS`; exit 0.
- Regression: `scripts/verify-platform.sh --only nav-keys-live` PASS; `--only
  nav-keys-live-self-test` PASS.

## Self-test

- `node scripts/verify-site-identity-live.mjs --self-test`: PASS. Clean controls green for
  `identity-local`, `identity-tls`, `site-panel`, `clear-data`, `shield`, `app-menu`, `quit-key`,
  `quit-row`. Eight plants, each red naming its text: `typed-lock`, `perm-refused`, `icons-stale`,
  `clear-signout`, `shield-stale`, `shield-leak`, `menu-dead-stock` (`did not open its stock page`),
  `quit-dead-row` (`quit did not exit`).
- `node scripts/verify-site-identity.mjs --self-test`: PASS (40 planted faults, incl.
  `quit-second-path`, `quit wired without its client method`, `Quit row sends nothing`).
- `node scripts/verify-shortcut-relay.mjs --self-test`: PASS (19 plants, incl. `ctrl-q-unreserved`).
- `node scripts/verify-web-tab-bridge.mjs --self-test`: PASS (32 plants, incl. the five lifecycle plants).

## Deviations

- **Ctrl+Q badge is text, not an accelerator.** UI-SPEC asks for a `Ctrl+Q` badge on the Quit
  row. Theia draws a menu accelerator only from a keybinding, and a keybinding would register a
  Theia-side Ctrl+Q, which this plan forbids (D-31-13). The badge is the label text
  `Quit PowerBrowser (Ctrl+Q)`. It is informational: it binds nothing, and the reserved row
  (`powerbrowser.js:327-335`) is the only Ctrl+Q. Product check: the badge wording is a human item.
- **`quit-second-path` is a static plant, not a live one.** The plan lists it among the live
  `--self-test` plants. A second `Services.startup.quit` cannot be planted in the running browser
  without changing the browser. The check is a tree walk in `verify-site-identity.mjs` (case "one
  quit path", plant `quit-second-path`), so it is red in `--self-test` of that gate. The live
  `--self-test` does not name it.
- **Quit scenarios are `quit-key` and `quit-row`, not steps of `app-menu`.** A quit ends the
  launch, and the runner gives each scenario its own launch. `app-menu` keeps the menu checks.
  The plan's acceptance list names `identity-lock,site-panel,clear-data,shield,app-menu`; the
  scenario names in this tree are `identity-tls` and `identity-local` (31-01), not `identity-lock`.
- **Harness library changes outside the plan's `files_modified`.** The quit checks need the
  child's exit status (`firefox-bidi.mjs`: `exitCode` on the callback), an exit wait shared with
  `quit()` (`pb-relaunch.mjs`: `awaitExit`, same behaviour), and the profile directory on the app
  object (`pb-live-probe.mjs`). No process is killed by name.
- **quitRequest takes no argument.** The plan's `quitRequest {}` is followed; CONTEXT D-31-13's
  `{page}` is superseded by the plan, which is the later and more specific document.
- **The dirty-editor fixture did not block the quit.** The plan asks for a dirty editor with the
  flush and exit checks. The fixture is an untitled editor with one edit. The live run exited
  normally, with no prompt. UI-SPEC.md:117 says quit is immediate, so no product decision was
  needed.
- **Plant `quit-dead-row` replaces the prototype method, as `menu-dead-stock` does.** Its clean
  control is the `quit-row` session with no plant.
- **Commit trailer** `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>` on every commit,
  per the instruction in force for this run. The plan's standing rule names another model.
- **Actuals.** The plan estimated 60000 tokens; the added lines measure 12172 by the chars/4 rule.
  The count includes the 205 remapped INTERNAL-APIS.md references.

## Blockers

None open.

## Not done

- A live check that a served page cannot trigger quit. The guard is static and in the code: the
  quitRequest kind is refused unless the sender is the shell frame (`handleStoreRequest`,
  `PowerBrowserAPI.sys.mjs:4065` refusal), and the Ctrl+Q `<key>` fires only on trusted key events.
  No live step drives a page-side keydown or a page-side store call.
- The Ctrl+Q key was pressed through the probe's parent key route (`nsITextInputProcessor`,
  `pressKey`), not a physical keyboard. Real-keyboard Ctrl+Q is in the human list below.
- The Quit row's keyboard use (arrow keys, Enter, Escape) and focus after quit: pointer events only.
- Pixel geometry of the Quit row's badge text and the row against UI-SPEC.

## Deferred human verification

- Real keyboard Ctrl+Q with the Theia frame focused, and with focus inside the Monaco editor
  (KDE Wayland), with an unsaved editor open. The live run covers the key route, not the hardware.
- Pixel review of the Quit row (`Quit PowerBrowser (Ctrl+Q)`), the 280px sheet and the separators
  against UI-SPEC (carried from 31-04).
- Keyboard use of the menu, including Quit (carried from 31-04).
- Product check: the badge wording as text in the label, in place of a Theia accelerator.

## Handoff

`.planning/phases/31-site-identity-permissions-and-app-menu/31-05-LIVE-HANDOFF.md`
