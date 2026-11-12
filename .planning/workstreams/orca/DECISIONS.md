# v1.7 Orca integration — owner decisions

All decisions by Chris, 2026-11-04, during `/gsd-new-milestone --ws orca`. Where an entry
conflicts with the seed (SEED-261103-o1g), research/INPUTS.md, research/SUMMARY.md or the
rebrand survey, **this file wins**.

## Direction (supersedes seed decision 1 and the release-only fetch)

**D-01 — Orca's tabs become real PB tabs.** Every Orca tab is a Lumino tab in PB's dock: it
moves between modes and is organisable like Theia and browser tabs.
- *(Superseded for Orca terminals by D-31, 2026-11-10: Orca terminals run on Orca's own engine
  and view, side by side with Theia terminals.)* Terminals are **Theia terminals only** (Chris,
  2026-11-04, second session). Orca uses them:
  orcad gets a Theia-backed `IPtyProvider` (a fifth implementation beside Local, DaemonPtyAdapter,
  DaemonPtyRouter and Degraded) that forwards spawn, write, resize, kill and data to Theia's
  backend. Orca's terminal daemon is not used. Agent hook env vars pass through at spawn.
- Files and diffs open in Theia's editor, with Orca worktrees opened as Theia workspace
  folders. Orca's own editor is not used.
- Browser panes become PB web tabs (see `NOTE-orca-tab-parity-direction.md`).
- Chat and the other Orca-only views each open as their own PB tab.

**D-02 — The rest of Orca's GUI stays Orca's**, with small modifications: the worktree
sidebar, settings and the orchestration panel. They live in a PB side panel.

**D-03 — PB-native UI is allowed.** Orca's React tab system may be replaced by PB/Theia
widgets, as long as Orca's features and orcad keep working and new Orca releases can still be
taken.

**D-04 — Orca is built from source at a pinned tag**, using Orca's own `build:web` and
`build:orcad` (pnpm). Changes go in as an **additive overlay** (revised 2026-11-04 after
`ADVERSARIAL-orca-ownership.md`): **new PB files first**, then **one-to-few-line regenerated
patches at declared seams**. **Whole-file swaps of upstream paths are forbidden**: a swapped
file changed in 19 of 20 release steps and silently drops upstream fixes. An automated rebase
job runs **weekly** against the newest tag (D-26); Orca ships about 5 releases a week, and the
first pin 1.4.248 was already one behind (1.4.249) on the day it was chosen.
- PB does not rely on Orca accepting upstream changes. Generic changes may be offered upstream
  later, to shrink the stack.
- This replaces seed decision 1 ("consumed by version, never patched or vendored") and the
  earlier "pinned release fetch". Node 24.22.1 for orcad still comes pinned by version and hash.
- First pin: **Orca 1.4.248**. Fall back to 1.4.245, the build proven live, if the spike probe
  fails on 1.4.248.

**D-05 — Order: the remake comes first.** The spikes and the tab remake come before the
hosting basics are finished. Nothing ships as "done" with Orca's client in one tab.

## VS Code Claude extension (new goal)

**D-06 — The Claude Code VS Code extension works alongside Orca tabs, beside the other Theia tabs:**
1. It runs on Orca worktrees. Rated easy: PB ships `@theia/plugin-ext-vscode` 1.76. That the
   extension runs fully on Theia 1.76 is unverified and is checked early.
2. Its sessions are visible in Orca. Rated medium: Orca's hooks stay silent without an Orca
   pane (`src/main/agent-hooks/hook-script-outside-orca.test.ts:51-84`), so PB creates a pane
   per extension session and passes the `ORCA_AGENT_HOOK_*` variables.
3. Orca agents can be used in the extension. Rated very hard while the agent is running.
   **Research live sharing** in a spike, with no promise made. Resuming a stopped session
   (`--resume`) is the realistic floor.
4. Same terminals. Now easy: all terminals are Theia terminals (D-01), so the extension and
   Orca already share them. *(Superseded by D-31: Orca terminals and Theia terminals are two
   kinds, side by side; the extension's terminals are Theia's, Orca's are Orca's.)*

## Runtime behaviour

- **D-07 — Quit (revised 2026-11-04): agents end when PB quits.** Theia's backend owns the
  PTYs and dies with PB; Orca's detached daemon is not used. Supersedes the earlier "keep running
  and re-adopt" rule, which existed only because Orca's daemon made it possible. *(Mechanism
  amended by D-31: Orca's terminal daemon is used again; agents still end on quit because
  `OrcaService` stops orcad, its terminal daemon and the daemon's descendants, RUN-05.)*
- **D-08 — Telemetry off:** set `ORCA_TELEMETRY_DISABLED=1` and `DO_NOT_TRACK=1`. The Orca
  cloud hosts (`*.onorca.dev`: push, login, relay, share, feedback) go on the egress allowlist
  so those features keep working.
- **D-09 — Keys:** inside an Orca tab, Orca's terminal gets Ctrl+W, Ctrl+T, Ctrl+Tab and
  Ctrl+PageUp/PageDown (a per-tab key policy). PB's tab shortcuts work everywhere else.
  *(Superseded by D-32, 2026-11-10: in Orca and Theia terminals only Ctrl+W and Ctrl+T go to the
  shell; Ctrl+Tab and Ctrl+PageUp/PageDown always switch PowerBrowser tabs.)*
- **D-10 — Hidden Electron is prevented:** PB's orcad must never find and launch an
  installed Orca desktop as a hidden browser engine.
- **D-11 — No Remote Agent in shipped PB:** WebDriver BiDi is only for tests and the spike.
  Production uses a chrome-side bridge that can reach only Orca-created tabs.
- **D-12 — Agent permissions:** keep Orca's default (skip-permissions on).
- **D-13 — Agent status hooks stay on.**

## Earlier decisions in this session (unchanged)

- Mode named "Orca"; renames and logos beyond the landing logo are cosmetic and deferred.
- The landing logo becomes the PB logo, by injection (JSWindowActor).
- orcad profile directory `powerbrowser-orca`. Set **both** `ORCA_USER_DATA` (orcad) and
  `ORCA_USER_DATA_PATH` (Orca CLI) to it. The research proved that setting only the first lets
  the CLI reach the user's real Orca desktop.
- Tab URI scheme `pb-orca:`. The requirement is that Orca tabs work in every mode and move
  between any modes.
- Platforms: Linux, macOS and Windows. Flatpak gets `--filesystem=home`.
- In scope: the Add-project UI and the credential-storage check.
- Deferred: palette, About-dialog credit, renames.

## Second-session decisions (2026-11-04, after the difficulty review)

- **D-14 — Node:** orcad runs **slot-less on Theia's Node 24.19.0**. The exact-24.22.1 check in
  `orcad-bundled-runtime.ts:19-33,63-76` fires only when the slot's runtime marker files exist;
  without them orcad needs Node 24 or newer. No second runtime is shipped. Supersedes the
  "Node 24.22.1 pinned by version and hash" line in D-04. Phase 60's spike proves the start.
- **D-15 — Tab layout: PB's dock owns the arrangement (corrected 2026-11-04).** The earlier
  premise was wrong: in shipped and web builds the **renderer** owns the layout; orcad ownership
  is the dark `ORCA_LAYOUT_OWNER=main` build switch (`src/shared/layout-owner-switch.ts`), off
  and unshippable. Decision: **one Orca pane = one Lumino tab**; Orca's in-tab splits and tab
  groups are **flattened** into Lumino splits (Chris accepted the trade-off). Spike question now:
  how PB's dock observes the client's layout state, and how to mount Orca's pane components in
  Lumino widgets (both use React 19.2.8).
- **D-16 — Bounded overlay (revised 2026-11-04).** "Leaf files" means **files PB adds**. Seam
  patches are capped (about ten) and named: PTY provider registration
  (`ipc/pty/provider/registry.ts` and/or `daemon/daemon-provider-state.ts`), browser provider kind
  (`orcad/orcad-browser-provider.ts`), web build entry (`vite.web.config.ts`), and possibly the
  orcad entry. Six such one-line patches applied cleanly in 19 of 21 releases. Anything deeper
  needs an owner decision. *(D-31: no PTY-provider seam is built; the overlay holds 010 only.)*
- **D-17 — Origin check:** the Theia token gate also rejects sidecar requests whose Origin is
  not PB's own pages. Closes the shared-loopback-cookie hole for every local page.
- **D-18 — Add project:** keep Orca's own Add-project flow and sidebar remove unchanged. PB adds
  no separate Add-project button. (Replaces the "Add-project UI in scope" line above.)
- **D-19 — Agent mark:** when an Orca agent drives a PB web tab, PB's Theia chrome bar shows an
  "agent is controlling this tab" mark with a Stop button. Stock browser windows unchanged.

- **D-20 — Remote hosts stay in.** orcad routes only the `local` host through the swappable PTY
  provider (`ipc/pty/provider/registry.ts:73-78`); SSH and paired-server (`runtime:`) hosts have
  their own paths that never touch the local daemon, so the Theia-only terminal rule costs them
  nothing. Remote may be PB-to-PB only if that is what works. *(D-31: remote terminals are
  deferred to a future re-pin; headless orcad at 1.4.248 has no SSH stack and no paired-server
  relay.)*
- **D-21 — Orca mobile is forked too.** Its source is in the Orca repo (`mobile/`, Expo, iOS and
  Android, ~2,200 source files) and is overlaid under D-04/D-16 like the client. Mobile is a remote
  control over orcad's runtime (sessions, terminals, files, browser, automations), not a layout
  mirror; PB-specific views are added to it.
- **D-22 — Mobile distribution: Android now, iOS later.** v1.7 builds and releases the Android
  APK on GitHub Releases. iOS waits for a signing decision; the 2026-11-01 no-store rule is
  unchanged for now.

- **D-23 — Mobile fork is its own milestone after v1.7.** v1.7 keeps orcad's mobile-facing
  protocol (pairing relay, runtime RPC) unmodified so the stock Orca mobile app pairs with PB's
  orcad meanwhile. Capture the fork as a seed for the next milestone.

- **D-24 — Live checks pass on Linux only.** All three OSes are built; macOS and Windows get a
  smoke test when a machine is available, as in v1.6.

- **D-25 — Run mode: interactive per phase.** Chris answers each phase's discuss step; execution
  runs between. Not `/gsd-autonomous` for this milestone.

- **D-26 — Re-pin weekly, automated.** The rebase job runs weekly against the newest Orca tag;
  a green run re-pins by itself, a conflict stops for a human.
- **D-27 — Offer the generic seams upstream.** Terminal provider, browser provider and extra web
  entry go to Orca as pull requests once each works in PB. PB never depends on acceptance.
  *(D-31: no terminal provider exists to offer.)*
- **D-28 — Terminal seam size.** *(Superseded by D-31: no Theia-backed provider is built.)* The
  Theia-backed `IPtyProvider` implements the 21 required
  members (serialize/revive, buffer snapshots, foreground-process queries, listProcesses, and the
  rest), not five operations; the contract changed in 9 of 21 releases, and orcad still probes
  node-pty at startup. Amends D-01.
- **D-29 — D-03 restated.** Orca's tab-group and tab-bar are not rendered in PB's entry; Orca's
  pane components are hosted in Lumino widgets. The mobile fork (D-21/22) is held to the same
  additive rule. D-23 holds because no protocol file is touched; protocol skew between a newer
  stock mobile app and the pinned orcad is a recorded risk (unverified whether newer apps refuse
  an older orcad).

## Bundled third-party parts (2026-11-10)

- **D-30 — Third-party parts with their own terms ship as pre-installed, removable extensions
  (rules 68-A).** Chris, on the Anthropic Claude agent SDK: "keep it but make an extension ... we
  ship with it installed and they can select or unselect it [and uninstall it], so the terms are
  on the extension."
  - `@anthropic-ai/claude-agent-sdk`, the only proprietary direct production dependency of Orca,
    leaves orcad's bundle. It ships inside a pre-installed PowerBrowser **Theia extension** (VS
    Code extension format) that carries Anthropic's terms. The user can disable it or uninstall
    it.
  - Host chosen: a Theia extension, not an Orca plugin. Orca's bundled plugins must use Orca's
    official publisher (`orca/src/main/plugins/plugin-bundled-bootstrap.ts`) and cannot supply a
    Node module to orcad.
  - orcad loads the SDK through one generic seam in `loadClaudeAgentSdk` that takes the SDK's
    directory from an environment variable whose name carries no PowerBrowser token. When the
    extension is absent or disabled, Orca's existing missing-package path applies, confined to
    the structured-Claude session. Claude terminal panes and every other agent are unaffected.
  - The same pattern applies to other third-party parts. Chris named uBlock Origin, pre-installed
    as a browser (Gecko) WebExtension; that one is BEXT-02 in v1.7. The general rule is
    `.planning/seeds/SEED-261110-preinstalled-extensions.md`.
  - Owner responsibility, open: Anthropic's terms must permit redistributing the extension. No
    release carries it before the owner confirms that.
  - Supersedes options (a)-(d) of open ruling 68-A in `68-CONTEXT.md`. Mechanism: P68-38;
    requirements BEXT-01 and BEXT-02.

## Terminals: Orca's and Theia's, side by side (2026-11-10)

- **D-31 — Orca terminals run on Orca's own engine and view, beside Theia terminals.** Chris,
  2026-11-10, in three answers: "So use the orca terminal the way orca is made, I wanted to do
  something different from what you are thinking, I was only thinking at a GUI level"; "Have 2
  different terminals the orca and the theia"; then, of the layouts offered, "Side by side".
  - An Orca terminal uses Orca's own engine: orcad's stock local PTY provider and its terminal
    daemon. PowerBrowser adds no PTY provider and no terminal seam patch.
  - An Orca terminal is shown with Orca's own terminal view (`TerminalPane`, xterm.js) inside a
    PowerBrowser tab: a Lumino tab hosting the Orca pane through Phase 64's Route A. Orca
    terminals are created through orcad's `terminal.create`, never through the Orca client's
    `createNewTerminalTab` (64-RESEARCH A4).
  - Theia terminals stay plain Theia terminals, as today. Neither kind replaces the other, and
    PowerBrowser does not join them.
  - Phase 63's bridge (Orca running on Theia's terminal engine: seams 020 and 030, the external
    PTY bridge, `@powerbrowser/orca-terminals`, the `o<n>` identity, `ORCA_EXTERNAL_PTY_ENDPOINT`)
    is dropped. The overlay keeps one landed seam, 010.
  - Supersedes, for Orca terminals: D-01's terminal bullet, D-28 (the provider's member count and
    wording), D-06 item 4 (shared terminals), the PTY-provider example in D-16, the terminal
    provider offer in D-27, and spike item 4 below. D-07's rule stands with a new mechanism: Orca's
    terminal daemon is used, and `OrcaService` ends orcad, the daemon and the daemon's descendants
    on quit (RUN-05; Phase 62's live check ended a 5-process tree including an agent). D-09 (keys)
    and D-13 (status hooks) apply unchanged to Orca terminal tabs. *(D-09 superseded by D-32.)*
  - **TERM-03 deferred.** Remote (SSH and paired-server) terminals stay unavailable at this Orca
    version: Phase 64 research measured that headless orcad at 1.4.248 has no SSH stack and no
    paired-server relay; only Electron main has them (`main/startup/main-process-runtime-launch.ts:122`,
    64-RESEARCH A1; 63-RESEARCH finding 1). TERM-03 moves to the v2 requirements and is re-examined
    at a future re-pin whose orcad serves remote terminals. This closes P63-24's open owner item.
    D-20 is held in abeyance until then.

## Terminal keys (2026-11-10)

- **D-32 — Shell keys in terminals.** Chris, 2026-11-10, answering "Terminal keys (TERM-04)": he
  chose "Shell keys in terminals".
  - In Orca terminals and Theia terminals, Ctrl+W and Ctrl+T go to the shell, as in a normal
    terminal.
  - Ctrl+Tab and Ctrl+PageUp/PageDown always switch PowerBrowser tabs, from terminals too.
  - Orca's window shortcuts are turned off inside hosted Orca terminals.
  - A tab is closed with the mouse or Ctrl+Shift+W.
  - Supersedes D-09 and D-31's "D-09 (keys) ... apply unchanged to Orca terminal tabs". Answers the
    TERM-04 owner decision 64-05 recorded: Orca's `TerminalPane` shortcuts took Ctrl+W and Ctrl+Tab
    before the PTY, while Theia `t<n>` terminals already passed Ctrl+W and Ctrl+T to the shell.
    TERM-04 is restated to this rule. Mechanism: gap-closure plan 64-06.

## Browser host attach failure (2026-11-11)

- **D-33 — A failed browser-host attach is folded into Phase 67's failure page.** Chris,
  2026-11-11, answering 66-06 Task 2 (the P66-33 diagnostics-row route): "Fold into Phase 67".
  - In Phase 66 a failed attach of PowerBrowser's browser host for Orca stays one frontend log
    line from `@powerbrowser/orca-browser` that names the failed step and no value. Phase 66 adds
    no diagnostics row and no frontend-to-chrome kind for it (66-06 option-g).
  - Phase 67 adds "browser could not attach" as one more failure class on its Orca failure page
    (RUN-06), with its own sentence, buttons and diagnostics row. Mechanism: 67-CONTEXT P67-36,
    plans 67-01 (the class and the client reason in chrome) and 67-03 (the copy, the sender in
    `@powerbrowser/orca-browser` and the live induction).
  - Supersedes P66-33's "and a diagnostics row" for Phase 66. Options e (a third non-agent
    web-tab kind) and f (a store request kind) are not built.

## Agent pages in Orca's store (2026-11-11)

- **D-34 — PowerBrowser adds each agent page to Orca's store from its own side.** Chris,
  2026-11-11, answering the orca-browser-agent-live clause (j) blocker of 66-06: "Add them from
  PB's side now".
  - Cause, measured in 66-06-SUMMARY.md (Task 2): no PowerBrowser-hosted page ever became an
    Orca store record in the pane client. PowerBrowser's thin browser host bypasses
    `WebRuntimeClient`, and WebRuntimeClient's browser path is the only path that puts a browser
    tab into the pane client's store. P66-09's reveal on a store activation therefore had no event
    source.
  - PowerBrowser's own Orca entry file (`pb-pane-mount.tsx`) adds a store row for each agent page
    when its web tab opens, and drops it on closePage or a user close. The row carries the
    page's browserPageId, so Phase 64's observer maps it to the existing web tab and creates no
    second widget. The row opens in the background and never moves focus (P66-07).
  - Selecting the row in Orca's store brings the PowerBrowser web tab forward (P66-09).
  - No Orca patch and no seam: the entry uses Orca's own store actions and record types at the
    pin. Mechanism and checks: gap-closure plan 66-07. Replaces options (a), (b) and (d) of the
    66-06 blocker.

## Windows an agent page opens (2026-11-11)

- **D-35 — A new window, tab or popup whose opener is an agent overlay is refused.** Coordinator
  ruling in auto mode, 2026-11-11, closing the 66-VERIFICATION gap (truth 8); the owner may
  override it.
  - Cause (66-VERIFICATION): the Phase 36 new-window adopt paths (`adoptLinkIn`,
    `adoptContentWindow`, `createPendingOverlay`) and the stock-window route never checked the
    opener's agent flag, so a link or `window.open` from an agent page became an ordinary user tab
    or stock window: the "browsers" message manager group (login manager attached), the user's
    cookie jar on the link path, no mark, not covered by Stop, a foreground popup taking the
    user's view, and a same-origin popup scriptable by the agent. Agent input is trusted, so it
    supplies the user activation those opens need.
  - Rule: the open is refused, not adopted, not sent to a stock window and not opened anywhere
    else, on every path: link targets (including a middle-click, a modified click and Enter on a
    link), `window.open` with or without features, form targets, the ClickHandler routes, and
    every `where` value. The agent's own navigation inside its tab is unaffected.
  - A refused open is logged once per tab and path, with no URL. When chrome refuses an open
    while an agent command is in flight on that tab, the command answers
    `browser_command_unavailable`. A new `browser_popup_refused` is not used: Orca's
    `BrowserErrorCode` is a closed union in a tracked Orca file (`runtime-browser-contracts.ts`),
    so a new code would need an Orca edit, and `browser_command_unavailable` already means "the
    command cannot do this here" (the HTTP-auth refusal uses it).
  - Two walls. In content, the agent overlay's browsing context carries
    `SANDBOXED_AUXILIARY_NAVIGATION` from creation, so `window.open`, `target=_blank` and form
    targets create no browsing context; this is the only wall a popup with features meets, because
    Gecko opens that stock window without asking chrome. In chrome, every new-window receiver
    refuses an agent opener: the link opener opens nothing, and the `browserDOMWindow` members
    throw, because their null makes Gecko open a stock window. A content-wall refusal happens
    before chrome code runs, so it is not logged and fails no command; the page's own
    `window.open` returns null. Mechanism and checks: gap-closure plan 66-08.
  - Owner item: revisit if real agent workflows need popups (for example an OAuth sign-in). The
    option then is to open them as agent overlays in the agent container (the agent message
    manager group, no autocomplete, background, marked, covered by Stop).

## Re-pairing after orcad restarts (2026-11-11)

- **D-36 — The hosted Orca client keeps its environment id across an orcad restart.** Coordinator
  ruling in auto mode, 2026-11-11, answering 67-06 Task 2 (criterion 1 restart recovery):
  option-a. The owner may override it.
  - Cause (67-07): the overlay's `repair()` saved the new session-only pairing through Orca's
    storage call only. Orca's web preload kept its own active environment (the replaced pairing)
    and its open client, which still held the session device key of the killed orcad. That key's
    row died with orcad (P65-17), so the restarted orcad refused the old client's reconnect.
    Orca's client then forgot "the active pairing", which by then was the new one, and the next
    `repair()` minted a new environment id. Orca's own comment says a new id strands the host's
    sessions (`web-runtime-environment.ts`, 64-RESEARCH A6).
  - Fix (overlay file `pb-session-pairing.ts`, Orca's own exports at the pin, no seam, no tracked
    `orca/` edit): every session-only pairing does what Orca's `addFromPairingCode` does. It
    closes the active clients, saves the pairing, and makes it Orca's active environment. The
    pairing it last made is kept in page memory without its device token, and passed as
    `previousEnvironment` when Orca's client has already forgotten its own copy. Orca's
    same-host rule (host public key and descriptor) then keeps the id and bumps the revision.
  - Once the client really changes pairing, Orca's store hydrates again and its pane list is empty
    for about 10 s (measured). The pane observer therefore holds every hosted tab through a
    re-pair, as P65-35 holds restored tabs after a reload (`onWillRepair`, `rehold()`), so the
    tabs keep their widgets and names.
  - P65-17 is unchanged. Nothing is written to Theia-origin storage, and a document reload still
    pairs again under a new id, because page memory does not survive a reload.
  - Proof: orca-failure-page-live's restart clause (gap-closure plan 67-07).

## What else an agent page can start (2026-11-11)

- **D-37 — Downloads and external protocols from an agent overlay are refused, and an agent overlay's initial document
  takes no command but the goto that replaces it.** Coordinator ruling in auto mode, 2026-11-11, closing the
  66-VERIFICATION re-verification gaps (Gap 1 downloads, Gap 2 first `about:blank`, Security finding 3 external
  protocols) and three 67-VERIFICATION follow-ups. The owner may override it.
  - Downloads. Cause (66-VERIFICATION Gap 1, proven live in 66-09's probe): an agent page's PDF attachment was saved to
    the user's download folder and its viewer opened in a stock browser window through `DownloadUIHelper.loadFileIn`,
    which no D-35 receiver sees. Rule: a download whose source is an agent overlay is refused, not saved and not
    opened. Mechanism: `SANDBOXED_DOWNLOADS` joins `SANDBOXED_AUXILIARY_NAVIGATION` on the agent overlay's browsing
    context (same write, same family as D-35's content wall). Gecko then classifies every download of the overlay and
    its frames as forbidden and cancels it before a file, a download row or a viewer exists. No Gecko patch.
  - External protocols. Cause (66-VERIFICATION Security finding 3, proven live): an agent page's link to a scheme an
    application handles raised a standalone dialog window, and with a granted handler it would launch the application
    with no dialog. Gecko's sandbox check exempts a top-level browsing context, so no sandbox flag covers it. Rule:
    external-protocol handling for an agent overlay (its page or a frame in it) is refused: no dialog, no launch.
    Mechanism: chrome points `@mozilla.org/content-dispatch-chooser;1` (the contract `LoadURI` creates for every
    external load it allows) at a chooser that refuses an agent overlay's browsing context and hands every other load
    to Gecko's own chooser unchanged. Installed with the first agent tab, through `PowerBrowserAPI.sys.mjs`.
  - Agent commands. A refused download or protocol launch counts as a refused open (D-35's counter, logged once per tab
    and path without the URL), so the agent command that triggered it answers `browser_command_unavailable`. Because
    those refusals land after the page's child replies (a download is a network round trip away from the click), a
    command served by the page child now waits one 100 ms beat, then while the overlay loads a document (up to 3 s),
    before it answers.
  - First document. Cause (66-VERIFICATION Gap 2, proven live): an agent overlay created for a slow first URL stays on
    its initial `about:blank`, which Gecko makes with the browsing context's `InitialSandboxFlags` (chrome cannot set
    them), so D-35's wall was absent there; a click then an eval of `window.open` with features opened a stock popup
    window. Rule: while the overlay's current document is its initial document, every agent command but
    `browser.goto` (which replaces that document) answers `browser_command_unavailable`.
  - Phase 67 follow-ups (67-VERIFICATION). The landing-logo answer also requires OrcaService's state to be `ready`
    (while Orca is failed with port-in-use, another program holds orcad's port). `orca-failure-page-live` waits for a
    new Theia document (a changed `performance.timeOrigin`) after its reload before any probe (WINDOWS 47).
    `shell-request-kinds` proves the Orca shell kinds are dispatched only after the sender wall.
  - Owner items: agent workflows that need a download (a report an agent fetches) or a `mailto:` hand-off; the first
    would need agent downloads kept in an agent-only folder with a privacy sentence, the second a per-scheme allow list.
    Mechanism and checks: gap-closure plan 66-09.

## The clipboard and site permissions (2026-11-11)

- **D-38 — "No clipboard access".** Chris, 2026-11-11, answering the 66-VERIFICATION owner decision on the
  clipboard; his choice: "No clipboard access". Agent tabs can neither write nor read the system clipboard.
  - Cause (66-VERIFICATION): an agent's trusted click gives the page transient activation, and with it
    `navigator.clipboard.writeText` and `document.execCommand('copy')` write the system clipboard
    (`nsContentUtils.cpp:8450-8458`, no focus requirement), so a parked agent page could replace what the user pastes
    next, for example into an Orca terminal. An agent `Control+v` pasted the user's clipboard into the page.
  - Rule: page clipboard writes and reads (the async Clipboard API, `document.execCommand` copy, cut and paste, and
    clipboard events) from an agent tab and its frames are refused. The agent's paste, copy and cut keys answer
    `browser_command_unavailable`. Orca's agent methods have no clipboard command. Agents can still type text.
  - Mechanism (no Gecko patch): Gecko has no per-browsing-context clipboard switch (the parent writes whatever a
    content process sends), so the wall is content-side, in a second agent pair, `PowerBrowserAgentPage`, registered
    for the agent message manager group only, all frames. At `DOMWindowCreated`, before any page script of the window
    runs, `Clipboard.prototype`'s read, readText, write and writeText become the page's own `Promise.reject` bound to a
    `NotAllowedError`. A trusted copy, cut or paste event is cancelled at the chrome event handler, ahead of every page
    listener, so Gecko copies, cuts and pastes nothing (`nsCopySupport.cpp` `FireClipboardEvent`). That covers
    `execCommand`, key and menu commands, middle-click paste and a page's `clipboardData`, also when the user acts in
    an agent tab. The agent child refuses the clipboard bindings of Gecko's shortcut tables
    (`ShortcutKeyDefinitions.cpp`) before sending any key. User tabs are unchanged.
  - Residual (owner item): on Linux, Gecko copies a selection the agent itself makes by mouse or select-all into the
    PRIMARY selection (`AutoCopyListener`). There is no per-document switch, so closing it would need a Gecko patch or
    turning off `clipboard.autocopy` for the user too. Mechanism and checks: gap-closure plan 66-10.
- **D-39 — "Separate per container".** Chris, 2026-11-11, answering the 66-VERIFICATION owner decision on site
  permissions shared across containers; his choice: "Separate per container".
  - `permissions.isolateBy.userContext` is true for all of PowerBrowser, set in both branding variants'
    `firefox-branding.js` through `scripts/generate.mjs`, like `network.dns.disablePrefetch`. A permission granted to
    an origin in one container (notifications, geolocation, camera or microphone remembered, a protocol handler) is
    not used by that origin in another container. That includes the agent container and the user's default one, in
    both directions, so the notification-click route to `clients.openWindow` needs a grant made in the agent container.
  - Side effect accepted: every container, the user's own included, keeps separate permissions. Mechanism and checks:
    gap-closure plan 66-10.

## Spikes this direction needs

1. Browser parity: what an Orca browser tab can do, and how PB chrome provides it
   (`NOTE-orca-tab-parity-direction.md`).
2. Orca tabs as PB tabs: routes, size and re-pin cost (`NOTE-orca-tabs-as-pb-tabs-spike.md`).
   It now works under D-04, so the question is how, not whether.
3. Claude extension: whether it runs on Theia 1.76, the pane registration for D-06 item 2, and
   live sharing (D-06 item 3).
4. Theia-backed PTY provider for orcad (D-01; dropped by D-31), and the layout-ownership spike
   (D-15).
