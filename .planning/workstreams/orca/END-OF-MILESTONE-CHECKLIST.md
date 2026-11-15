# v1.7 end-of-milestone checklist (owner: Chris)

Everything left that needs a person, in the order to do it. Paths are relative to the repo root
unless they start with a phase number. Phase folders are under `.planning/workstreams/orca/phases/`.
Sources are abbreviated: STATE = `.planning/workstreams/orca/STATE.md` "Deferred Verification";
DEC = `.planning/workstreams/orca/DECISIONS.md`; CF = `.planning/CARRY-FORWARD-v1.7.md`;
WIN = `.planning/WINDOWS.md`; NN-V / NN-S / NN-C = that phase's VERIFICATION / SUMMARY / CONTEXT file.

Rule from D-18 (59-CONTEXT): nothing here ran earlier on purpose; this is the one pass.

## 1. Rulings and approvals (decisions only)

Say "accept" or "override" for each. Accept is the recorded default.

- [x] Popups from agent pages stay refused? Override only if a real agent workflow needs one, such as an OAuth sign-in (then they open as agent tabs in the agent container). (DEC D-35; 66-08-S "Owner items"; 67-06-S "Owner items", row D-35; STATE row 66, 67) — resolved: accepted (D-41).
- [x] Agent downloads and `mailto:`-style external-app links stay refused? Override only if an agent workflow needs a download (agent-only folder plus a privacy sentence) or a mail hand-off (per-scheme allow list). Also covers the external-protocol dialog from agent pages. (DEC D-37; 66-09-S "Owner items"; 67-06-S "External protocols"; STATE row 66) — resolved: accepted (D-41).
- [x] Accept that the hosted Orca client keeps its identity across an orcad restart. (DEC D-36; 67-V human_verification; STATE row 67) — resolved: accepted (D-41).
- [x] Acknowledge the accepted risk that on Linux, text an agent selects by mouse or select-all is copied to the middle-click (PRIMARY) selection; closing it needs a Gecko patch or turning autocopy off for you too. (DEC D-38 "Residual"; 66-10-S "Owner items"; STATE row 66) — resolved: acknowledged (D-41).
- [x] Acknowledge that "separate permissions per container" (D-39) applies to every container you own, not only the agent one. (DEC D-39; 66-10-S "Owner items") — resolved: acknowledged (D-41).
- [x] Accept the remaining agent-tab risks: permission prompts and the file picker need you, the agent container is visible, audio and WebRTC without devices, a compromised content process could clear its own sandbox flags (T-66-08-04, T-66-09-04). (66-10-S "Owner items"; 66-08-S; 66-09-S; 67-06-S "T-66-08-04") — resolved: accepted (D-41).
- [x] Rule on the auto-mode Phase 66 picks: Orca's browser provider via S2 not S1; no WebDriver BiDi in shipped code; Stop ends agent control for the tab's life; browser tools U-06/07/08 and the U-12 tile deferred; agents use their own container and never your logins; a page reload closes agent pages; timer throttling of parked agent tabs; agent page dialogs block the IDE while open; agent visits enter your history. (66-C "Owner decisions open" table; 66-06-S rows O1, O2, "Places history"; 66-V human_verification "Deferred owner table"; STATE row 66) — resolved: accepted as recorded (D-41).
- [x] Rule on the Phase 67 picks: refuse the plaintext credential override; the protection sentence on only the two refusal pages and the privacy page; orcad shares `~/.orca` with any other headless orcad; live test profiles moved out of `/tmp`; one used token row per paired launch stays in `orca-devices.json`; the workspace path stays in the Orca tab URL; Orca's renderer runs in the authenticated Theia page; no separate page class for a browser host that never attached. (67-06-S "Owner items": P67-17, P67-18, P67-19, P67-21, CA-07, P65-06, T-61-04, "Browser host page class"; 67-V human_verification; STATE row 67, row 65) — resolved: accepted as recorded (D-41).
- [ ] Rule: should live test rows write your real `~/.orca`, or run with HOME set to a scratch folder? (67-06-S "HOME for live rows"; STATE row 67)
- [x] Rule on the Phase 65 picks: Orca Settings in a side panel (needs 660 px) or a main-area tab; session-only pairing via Orca's plain export or a declared seam; contacting favicon hosts when launching straight into Orca mode. (65-05-S "Deferred Verification": P65-09, P65-17, Egress row; STATE row 65) — resolved: accepted as recorded (D-41).
- [x] Rule on the Phase 64 picks: boot Orca at frontend start; no activation hook; the html-clause ruling; the worktree pick for new Orca terminals and chats; the in-session key control; the Orca address-bar default (Address); the shipped Orca mode hiding a custom mode named "Orca"; and the Orca shortcuts that stay active in hosted terminals (paste, copy-with-selection, expand pane; Ctrl+V and Ctrl+C cannot be released without an Orca patch). (STATE row 64: P64-05, P64-18, Open Question 4, P64-37, P64-33, OWNER REVIEW 64-06; 64-V "Deferred Items" row 4) — resolved: accepted as recorded (D-41).
- [x] Rule on licence item 68-B: the per-package permissive-licence set and its exception rows. (WIN 44 item 1; 68-06-S "Open owner licence items"; STATE row 68) — resolved: approved (D-42); WIN 44 fixed.
- [x] Rule on the GPL-3.0 section 6 reading for the bundled uBlock Origin extension. (WIN 44 item 3; DEC D-30; STATE row 68; 68-C P68-39) — resolved: accepted (D-44).
- [x] Rule on the "web-entry" upstream class: rule it out (as D-31 did for terminals; the check's class list then changes) or ask for a later phase to add a seam. (WIN 52; 68-05-S "Owner hand-off" item 2; STATE row 68) — resolved: ruled out (D-45); WIN 52 fixed.
- [x] Confirm A-P1 (the re-pin carries THIRD-PARTY-NOTICES.txt). (68-06-S "Deferred"; STATE row 68) — resolved: confirmed (D-41).
- [ ] Rule that the SDK extension has no reinstall affordance in v1.7 (no way back after an uninstall), or ask for one. (68-09 via 68-06-S; STATE row 68)
- [x] Approve the Phase 61 ordering override for roadmap criterion 4 (Phase 63 was planned before its route line existed; route came from the spike 006 record) and the YELLOW conditions copied into Phases 64 and 66. (61-V truth 4; STATE row 61) — resolved: approved (D-41).
- [x] Accept the judgment-tier plan prohibitions marked "unverified" in 67-01..67-05. (67-V human_verification last item) — resolved: accepted (D-41).
- [x] Name one owner date for every WINDOWS entry still open after the fixes (each keeps its id; it closes only with its fix). (59-CONTEXT D-09; 59-04-S) — resolved: "next version" for every open entry (D-46).
- [ ] Approve the exact wording of: the four agent-control mark strings ("Agent in control", its description, "Stop", the Stop tooltip); the privacy-page paragraph on agent tabs and the lines in `chrome-bar-copy.ts:77-80` and `privacy.html:87`; the eight failure-page messages, the protection sentence and the two RUN-09 sentences; the two new-terminal and new-chat quick-pick placeholders. (STATE row 66, 67, 64; 66-C "Deferred Verification"; 66-V; 67-V; 67-06-S row "Copy")

## 2. Actions outside the app

- [ ] Delete the stray build folder left by a mach call without MOZCONFIG (`rm -rf upstream/obj-x86_64-pc-linux-gnu`; then `git -C upstream diff` should stay empty). (68-06-S "Deviations" 12 and "Deferred")
- [ ] Remove the leftover worktree directories earlier live runs left under `~/orca/workspaces/repo/` (by hand). (65-05-S "Deferred Verification", Cleanup row)
- [ ] Regenerate the seam 010 export (`node scripts/export-orca-seam-pr.mjs --class browser-provider`), open the issue on Orca's repository from `.mozbuild/orca-upstream/browser-provider/issue.md`, then the PR from a fork with `seam.patch` and `pr.md` ("Fixes #<issue>"), and record the PR URL in `orca-overlay/seams.json` seam 010 `upstream.pr`. Fork and org are your choice. (WIN 51; 68-05-S "Owner hand-off" 1 and 4; STATE row 68)
- [ ] File Orca Issue B (web client does not advertise the authoritative-inventory capability); do not file Issue A, fixed upstream. (68-05-S "Issue B", "Owner hand-off" 3; 68-06-S "Deferred")
- [ ] Re-lock the three ledger-locked check files after reading their diffs: `scripts/verify-ng-023-suggestions-places.mjs`, `scripts/verify-ng-027-reader-callers.mjs`, `scripts/verify-ng-067-frontend-errors.mjs` (ledger amend tool, `lock-checks` subcommand; owner-only). (59-04-S "Owner items"; 62-V "Deferred Items" 3; STATE row 62)
- [x] Read Anthropic's terms (https://code.claude.com/docs/en/legal-and-compliance), and if they permit redistributing the Claude agent SDK extension, set `terms_check` to confirmed in `inventory/licence-allowlist.json`. No release is cut before this. (WIN 44 item 2; DEC D-30 "Owner responsibility"; 68-06-S line 198; STATE row 68) — resolved: confirmed, "Confirmed, terms permit it" (D-43).
- [ ] Supply the secrets still missing: R2 MAR write token (release environment), clock App private key (then scheduler deploy and watchdog enable), Upptime `GH_PAT`, Codeberg org, repo and token. (CF CF-01, "Parked, waiting on Chris"; 59-04-S "Owner items")
- [ ] GitHub notifications (email on failed workflows; mobile push), the drills, old-repository archive, and device-flow tokens for the App-list reads (`REPO_CONTROLS_TOKEN_<SLUG>`, live `repo-controls`). (CF CF-02, CF-07; 59-04-S "Owner items" tasks 5 and 7)
- [ ] MAR key ceremony: two primary `.p12` copies, secondary ceremony, release secrets. (CF CF-03; 59-04-S task 8; plan 44-01)
- [ ] Legion runner: install `systemd/legion-pb.nix` by its header steps, the `/etc/nixos` change, runner acceptance drill, first Codeberg mirror push. (CF CF-04; 59-04-S task 9)
- [ ] Local release build; Anthropic Console fixer and triage workspaces with spend caps; Nix channel hash record and Cachix; TEL-13 crash-reporter switch-on. (CF CF-05, CF-06, CF-09, CF-11)
- [ ] First Linux release: release probe, merge the bump PR, approve the `release` and `descriptor` environments, hop drill, `/download` check. (CF CF-08)
- [ ] First live weekly re-pin tick: confirm the bump PR with auto-merge armed and give the approving review. (STATE row 68; 68-06-S "Tracking" OVL-02)
- [ ] Dispatch `release.yml` to produce the Linux artifact with Orca (D-40: the `windows-orca` and macOS jobs moved to the next version), including the container-built release tarball. (STATE row 68; WIN 30, 48)
- [~] (D-40: moved to the next version) Windows 11 VM (ISO, licence, disk) and the Windows smoke test of the Orca build: install, start, open Orca mode, orcad runs from `<GreD>/orca` on `node/node.exe`, quit leaves no orcad. (CF CF-10; WIN 50; STATE row 68)
- [~] (D-40: moved to the next version) macOS smoke test and artifact, which need a Mac (and an owner choice for the Darwin rust-std route). (WIN 48, 49; STATE row 68; CF section 2 "Phase 55 macOS")
- [ ] Rotate the Cloudflare token `powerbrowser-claude` (`~/.config/cloudflare/pb-token`, expires 2026-12-06; it was pasted in a chat). (CF CF-13)
- [ ] Settle the open owner values: mailbox, spend caps, Cloudflare payment method on file (recorded UNKNOWN), disk for `pkg-win11`. (CF section 2 "Also deferred"; 59-04-S task 3)

## 3. Hands-on checks in the running app

- [ ] Run the 41-item v1.5 human checklist and the live halves of verify-work 29, 30, 31, with every verdict written into its UAT row (closes NG-089 and re-ticks the v1.5 requirement rows). (`.planning/milestones/v1.5-phases/39-v1-5-close-out/39-HUMAN-CHECKLIST.md`; `/gsd-verify-work 29`, `30`, `31`; 59-06-PLAN; CF CF-17; STATE row 59)
- [ ] Run `/gsd-verify-work 59 --ws orca`. (STATE row 59)
- [ ] Claude Code extension on the Orca worktree in PowerBrowser's Theia: open the worktree, install Anthropic.claude-code, sign in, ask a question, accept a file edit; retry with `claudeCode.useTerminal` if the panel fails. (60-05-PLAN Task 2; `60-EXT01-RECORD.md`; STATE row 60)
- [ ] Resume a stopped Orca agent session inside the extension (terminal route `claude-vscode.terminal.open` with `--resume`, and the `vscode://Anthropic.claude-code/open?session=` route); record which work. (`.planning/spikes/006-orca-live-sharing/README.md` "Blocked on EXT-01" steps 1-4; 61-V truth 3; STATE row 61, 63)
- [ ] Run the Claude Code extension's `claude` through PowerBrowser's wrapper with the session live in Orca; and look at the wrapper's placeholder pane as an Orca terminal tab. (63-V truth 3, assumptions A3, A5; STATE row 63, 64: P64-36)
- [ ] Tab groups: re-run `orca-tabs-live` stage g2 with a real group split (drag a tab to a group edge), then a g3 drive with a second client that receives host frames (currently red, TAB-04). (STATE rows 64, 65; WIN 55; 65-05-S "Still red")
- [ ] Look at the hosted Orca chat against Orca's own; check Orca's running-agent close confirmation (readable, buttons work) and the busy-chat close. (STATE row 64)
- [ ] Hosted terminals and web pages: Ctrl+Shift+W from a focused web page, Ctrl+[ and Ctrl+], and a layout-restored Orca tab's title before boot. (STATE row 64; 64-V "Deferred Items" row 4)
- [ ] Run `/gsd-verify-work 65 --ws orca`; read check-details as an Orca-only view; look at the populated orchestration and creation surfaces; see whether Orca's simulator and check-details panes also vanish on reload in stock Orca. (STATE row 65; 65-05-S "Deferred Verification")
- [ ] Run `/gsd-verify-work 66 --ws orca` and re-run `orca-browser-agent-live` (including the decoy clause (f) on a host with a real Orca installed). (STATE row 66)
- [ ] Agent mark and Stop button readable and placed correctly in light and dark themes. (66-V human_verification; 66-C "Deferred Verification"; STATE row 66)
- [ ] Real agent session in a real worktree while you work in another tab: no focus loss, no lost keystrokes, mark only on the agent tab. (66-V human_verification; 66-C)
- [ ] See how the agent container looks in the stock window's container UI, and what the native file picker an agent click can raise looks like. (66-V "Deferred owner table")
- [ ] Run `/gsd-verify-work 67 --ws orca`; induce each failure (kill orcad, hold its port, chmod the offer file 0644) and view the failure page in light and dark themes: legible, buttons under the sentence, focus order reaches every button. (67-V human_verification; STATE row 67)
- [ ] Open orcad's address in a web tab in the dark theme and confirm the PowerBrowser mark shows on Orca's dark landing tile. (67-V human_verification; STATE row 67)
- [ ] Pair the stock Android Orca app with PowerBrowser's orcad (through Orca's relay) and record the result beside the `orca-mobile-skew` output. (68-C P68-17; STATE row 68)
- [ ] After the above, run `scripts/verify-platform.sh --gate` on the final tree; every remaining red must be keyed to an open WINDOWS entry with an owner date. (CF section 3 exit criterion; 59-CONTEXT D-09; 68-06-S Deviation 10)

## 4. Push (last)

- [ ] Push `main` (including the v1.5 close-out commits still local), tags `v1.5` and `v1.6`, and `ServerDestroyer/v1.7-Orca-integration`, in one go on your word. Ask before writing any org name (the GitHub org is moving to `deocracy`). (59-CONTEXT D-11; CF CF-19)

## Unclear — confirm

- [ ] Ledger rows NG-075, 076, 077, 078, 079, 080, 081 (and NG-089) are open and due with no check recorded; D-14 reopened them and says 078-080 close in plan 59-05 and 089 in 59-06, while 075, 076, 077, 081 "stay open on 999.2 for a later v1.7 phase". Decide for each: close with evidence, or approve a deferral. The old drop commands (CF-12, R15) are withdrawn. (59-CONTEXT D-14; 59-04-S "Task 2"; CF section 5 ledger table is stale)
- [ ] Which of section 2's credential steps already ran in the `p59-owner` child workspace? Its log (`59-OWNER-LOG.md` on branch `ServerDestroyer/p59-owner`) is not on this branch, so I could not tell what is done. (59-CONTEXT D-16; 59-07prep-S)
- [ ] Plan 57-08 (clearing `MOZ_CRASHREPORTER_AUTO_SUBMIT`) must land before the TEL-13 switch; CF calls it unblocked and 59-04-S calls it complete, but no source states it shipped. (CF CF-11, CF-15; 59-04-S)
- [ ] Were tags `v1.5` and `v1.6` pushed already? CF section 0 says `v1.5` was pushed, CF-19 says it waits; `v1.6` is untagged (v1.6 still open). Decide whether to close v1.6 and tag it. (CF header, CF section 3, CF-19; 59-CONTEXT D-11)
- [x] Windows twin of the POSIX claude-wrapper launcher (WIN 53) and the packaged-row teardown that leaves orcad running (WIN 54) are code gaps, not owner checks; confirm whether to fix, or re-date them under the owner date. (WIN 53, 54; STATE row 68) — resolved: WIN 54 fixed (0ea32a1a); WIN 53 moved to the next version (D-40).
- [x] Phase 55 macOS items (WIN 22, 23) and FIX-10 / Phase 43 / Phase 58 dated deferrals: in scope for this sitting, or stay dated? (CF section 5) — resolved: stay dated; macOS moved to the next version (D-40).
