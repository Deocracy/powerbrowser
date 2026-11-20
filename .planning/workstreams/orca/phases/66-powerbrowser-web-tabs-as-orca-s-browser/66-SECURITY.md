---
phase: "66"
slug: "66-powerbrowser-web-tabs-as-orca-s-browser"
workstream: orca
milestone: v1.7
status: draft
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 1
threats_open_below_block_on: 1
threats_total: 62
threats_closed: 60
asvs_level: 1
block_on: high
register_authored_at_plan_time: true
auditor_verdict: ESCALATE
audited_commit: e0c19c54
created: "2026-11-20"
---

# Phase 66 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Phase 66: PowerBrowser web tabs as Orca's browser.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Pane bundle to host link | The `link` global in the thin browser host bundle, reachable by any script in the document | Placement ids, page rows |
| Theia host to orcad | The Orca browser host attach, page table and placement override | Browser page ids, attach offer (credential material) |
| Theia frontend to chrome | `webTabOpen` agent flag and `webTabAgent` arm (first and second wall) | Tab ids, agent commands, agent-control pushes |
| Chrome to agent page content process | `PowerBrowserAgent` actor child, agent message manager group | Snapshots, refs, cookies, clipboard, page opens, downloads, protocol launches |
| Agent container to user container | Agent tabs vs user tabs (cookies, permissions, popups) | Cookie rows, permission grants, user clipboard |
| Live verification harness to host | Live rows, scratch HOME and profile, inherited `ORCA_*` environment | Process environment, logs, offers |
| Lane merges to the phase branch | Parallel lane tips merged by the coordinator | Source paths outside a plan's `files_modified` |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-66-01 | I | link global (pane bundle) | medium | accept | Acceptance documented: 66-01-PLAN.md:285, 66-01-SUMMARY.md:191-192 (owner item); STATE.md:174,177 carry owner item T-61-04; D-41 (DECISIONS.md) keeps the Phase 66 auto-mode picks. The rationale's non-writable claim holds in code: orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host-link.ts:91-97 (writable:false, configurable:false, Object.freeze). | closed |
| T-66-02 | T | thin host bundle | high | mitigate | scripts/verify-orca-browser-host-bundle.mjs:142-146 (modulesVerdict: no web-runtime-client.ts), :149-156 (sourcesVerdict: no WEB_RUNTIME_CLIENT_CAPABILITIES write, no subscribeOnCurrentConnection), plants :316-318; registered scripts/verify-platform.sh:4053 (self-test) and :6871 (full). Host imports only shared modules and web-paired-e2ee-primitives (pb-browser-host.ts:13-25); a grep of orca-overlay/files/src/renderer/src/pb/ finds none of the three names outside comments. | closed |
| T-66-03 | I | attach probe, build logs | high | mitigate | scripts/verify-orca-browser-host-bundle.mjs:385 installs output redaction before startOrcad (:405), :410-414 parse the offer in memory and re-install redaction with its secrets, :552-553 redaction verdict fails on any offer field in output or the newest build log. pb-browser-host.ts and pb-browser-host-link.ts contain no console call. | closed |
| T-66-04 | S | placement override | medium | mitigate | Declared PB-side half absent: pb-browser-host-link.ts:61-71 setPlacement accepts any non-empty string or null; it is not bound to the id the Theia host attached with, and the link object is reachable by any script in the document. Only caller orca-browser-frontend-module.ts:243,250 passes its own id, which is not a restriction. The orcad half is present in pinned third-party code (orca/src/main/runtime/browser-host/browser-host-client-page-creation.ts:47-48, browser_host_lease_stale). Open, below the high threshold, so non-blocking. | open — below high threshold (non-blocking) |
| T-66-SC (66-01) | T | npm/pip/cargo installs | high | mitigate | No package added: git diff 5a13abab..6cbead2c (lane p66-01) touches no package.json or lock file; theia/yarn.lock has no commit since 5a13abab; the host bundle is built from Orca's installed node_modules (orca-overlay/files/vite.pb-browser-host.config.ts, scripts/build-orca-browser-host.sh). | closed |
| T-66-05 | E | page table (first wall) | high | mitigate | theia/extensions/orca-browser/src/common/orca-browser-dispatch.ts:29-61 one-to-one table checked both ways; :124-126 a bound id never gets a second tab; :144-147 unbound id answers browser_tab_not_found; :152-154 reclaimPage/restorePage only for bound ids, nothing adopted; :134-142 closePage. Trace plants in scripts/verify-orca-browser-abilities.mjs (registry verify-platform.sh:4060-4061); page-table clause in verify-orca-browser-tab-scope.mjs. | closed |
| T-66-06 | E | webTabOpen agent flag | high | mitigate | Client: theia/extensions/tab-uris/src/browser/web-tab.ts:984-986 agent sent on the first webTabOpen only; :1817-1825 openAgentTab is the only caller passing asAgent. Chrome: powerbrowser/shell/PowerBrowserAPI.sys.mjs:2798-2802 accepts only exactly true; :3582-3586 already-open returns before any flag; :3655-3657 agentTabCreated runs only for a newly created overlay. | closed |
| T-66-07 | I | stale agent tabs after reload | medium | mitigate | theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts:201-206 prepare() closes stale agent tabs before the attach in run() (:217-252); :432-438 closeStaleAgentTabs; :415-429 closeEndedPages closes a previous frontend's pages after attach (66-06 fix 5c60d6bd). Reload clause (i) in scripts/verify-orca-browser-agent-live.mjs:253. | closed |
| T-66-08 | S | focus | medium | mitigate | web-tab.ts:1817-1821 openAgentTab adds the widget with no activateWidget; theia/extensions/orca-panes/src/browser/orca-pane-observer.ts:253-263 activates only the tabs reveal() returns; orca-browser-dispatch.ts:194-221 reveal tracker with the creation guard (noteCreated). Live clauses (c), (c2), (j) in verify-orca-browser-agent-live.mjs. | closed |
| T-66-SC (66-02) | T | npm/pip/cargo installs | high | mitigate | theia/extensions/orca-browser/package.json dependencies are only @powerbrowser/tab-uris 0.1.0 and @theia/core 1.76.0 (both already installed workspace/pinned packages); other manifest edits add only @powerbrowser/orca-browser rows; theia/yarn.lock unchanged since 5a13abab. | closed |
| T-66-09 | E | webTabAgent arm (second wall) | critical | mitigate | powerbrowser/shell/PowerBrowserAPI.sys.mjs:5590-5596 arms route to the section; :11746-11761 handleWebTabAgent checks tabId shape, AGENT_METHODS membership, the params validator, then agentWallVerdict (:11202-11213: unknown-tab unless owned by this sender, not-agent-tab unless entry.agent and its own container, agent-stopped) before any page work. Flag set only at creation (:3655). Tab-scope rows verify-platform.sh:4079,4085 with wall and flag plants. | closed |
| T-66-10 | T | PowerBrowserAgent child | high | mitigate | PowerBrowserAPI.sys.mjs:11840-11846 registers PowerBrowserAgent with no matches, no events, allFrames false, agent message manager group only; getActor(AGENT_ACTOR_NAME) only at :11409 and :11716, both reached after the wall; params validated at :11754 (agentParamsOk :11195-11198). Child accepts only Run/Abort/Size and an AGENT_RUN arm (GroupActorChild.sys.mjs:697-718). | closed |
| T-66-11 | I | cookie rows, agent pages | high | mitigate | PowerBrowserAPI.sys.mjs:3588-3591 no container, no agent tab; :3620 usercontextid and agent group set before appendChild (:3648); :11218-11221 wall requires the page's userContextId to equal the agent container; :11468-11470 every cookie row uses agentOriginAttributes. Live clause (e) verdictContainer and (e2) in scripts/verify-orca-browser-agent-live.mjs:182-194. | closed |
| T-66-12 | S | parked overlay | medium | mitigate | PowerBrowserAPI.sys.mjs:11232-11243 parks agent overlays at zIndex -1; :4214-4216 webTabGeometry applies the placement and sets docShellIsActive = !!visible; :11225-11227 overlayShownToUser is the only style.visibility comparison in the file (grep), with 9 call sites. Focus guard :11360-11377. | closed |
| T-66-13 | E | Remote Agent | high | mitigate | scripts/verify-no-remote-agent-port-live.mjs:128-131 controlVerdict (detector must see the Remote Agent socket), :134-136 shippedVerdict (no unaccounted socket), :278 control launch with --remote-debugging-port=0; registered verify-platform.sh:6877-6878. Product shell code references the Remote Agent only in a comment (PowerBrowserAPI.sys.mjs:940). | closed |
| T-66-14 | E | child allowance | medium | mitigate | scripts/check-internals-boundary.sh:117-118 ACTOR_CHILD_PATTERNS adds exactly 'Cc[' and 'Ci.'; :460-462 self-test plants an uncatalogued Cc[ line, an uncatalogued Ci. line and a Services. line. Non-comment Services./Cu./nodePrincipal lines in GroupActorChild.sys.mjs: 0. | closed |
| T-66-15 | D | page dialogs | medium | accept | Acceptance documented: 66-03-PLAN.md:299; STATE.md:139 (O2 under Blockers/Concerns) and STATE.md:176 (owner items); 66-06-SUMMARY.md Deferred Verification row O2. | closed |
| T-66-SC (66-03) | T | npm/pip/cargo installs | high | mitigate | Lane p66-03 diff 5a13abab..7ba51cf4 touches no package.json or lock file; theia/yarn.lock unchanged since 5a13abab. | closed |
| T-66-16 | I | snapshot of a user tab | high | mitigate | browser.snapshot is an actor row reached only through agentRunInChild (PowerBrowserAPI.sys.mjs:11714-11731), called at :11774 after the wall and at :11643 from a native row that is itself behind the wall; the child actor exists only in the agent message manager group (:11844). Lane p66-04 diff touches no PowerBrowserAPI.sys.mjs. | closed |
| T-66-17 | T | ref table | medium | mitigate | powerbrowser/shell/GroupActorChild.sys.mjs:805-811 table keyed by innerWindowId, reset on a new document; :1064 refs held as WeakRef; :207-222 unknown ref browser_ref_not_found, gone or disconnected node browser_stale_ref. | closed |
| T-66-18 | D | snapshot size | low | mitigate | GroupActorChild.sys.mjs:799 SNAP_MAX_BYTES 768 KiB; :1202-1205 an oversize result throws browser_error before it is returned. | closed |
| T-66-19 | T | fixture generation | low | accept | Acceptance documented: 66-04-PLAN.md:253; scripts/gen-orca-snapshot-fixtures.mjs:25 ('Developer host only: neither agent-browser nor Chromium ships'), :90 fixture server on 127.0.0.1; agent-browser pinned at orca/package.json:235. | closed |
| T-66-SC (66-04) | T | npm/pip/cargo installs | high | mitigate | Lane p66-04 diff 7ba51cf4..9818284b touches no package.json or lock file; agent-browser is Orca's existing pin (orca/package.json:235 '~0.39.4'). | closed |
| T-66-20 | S | agent mark | medium | mitigate | theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:1686-1700 renders only from currentWebTab().agentControl; that field is set only at web-tab.ts:607-614 -> :1506-1510 from the agentControlChanged push, which chrome sends at PowerBrowserAPI.sys.mjs:11663-11669; live row verify-orca-agent-mark-live.mjs. L1 only: the push listener (web-tab.ts:741-753) does not check isTrusted, so in-document script could forge a push; not judged at this ASVS level. | closed |
| T-66-21 | R | Stop | high | mitigate | PowerBrowserAPI.sys.mjs:11809-11819 Stop sets stopped and aborts in-flight calls; stopped is never reset (only initialised at :11658); :11209-11211 and :11786-11787 answer agent-stopped; orca-browser-dispatch.ts:87 maps it to browser_owner_unavailable; scripts/verify-orca-agent-mark-live.mjs:56 requires it in error.message. | closed |
| T-66-22 | I | copy rows | low | mitigate | theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts:77-80 four rows with no internal identifier; scripts/verify-shell-error-copy.mjs:585 and :619-622 reviewed set; row shell-error-copy-no-internals at verify-platform.sh:4654. The owner copy review is deferred to the end pass (D-41 leaves copy wording open). | closed |
| T-66-23 | D | live rows on the host | medium | mitigate | scripts/lib/orca-tabs-live.mjs:201-204 redaction installed first, :208 mkdtemp scratch, :146-148 and :212-213 inherited ORCA_* scrubbed, :335-336 processes signalled by recorded pid and start ticks; scripts/lib/orca-run.mjs:81-84 orcad env strips ORCA_*; scripts/lib/orca-browser-live.mjs:178-188 wraps withOrcaTabsSession with a CLI env built from scratch. The pb-live lock is applied by the operator (flock in verify-platform.sh comments :6891 and the script headers), not acquired in code. | closed |
| T-66-SC (66-05) | T | npm/pip/cargo installs | high | mitigate | Lane p66-05 diff 7256c82b..6bfd8081 touches no package.json or lock file; theia/yarn.lock unchanged. | closed |
| T-66-24 | T | lane merges | high | mitigate | Merges d9eaa894, eb1c3885, d74352a4, 34f792bc, 94b8329a take the recorded lane tips, and the scope check was run, but it was not enforced: p66-03 (git diff 5a13abab 7ba51cf4: scripts/verify-ext-tab-host-scope.mjs) and p66-05 (git diff 7256c82b 6bfd8081: scripts/verify-shell-error-copy.mjs) carry paths outside their plans' files_modified that are not Phase 64 path substitutions. They were merged on the coordinator's own acceptance (66-06-SUMMARY.md:86-94). That breaches merge rule (2) and the 66-06 prohibition, and no owner ruling is recorded. Reproduced here from each plan's files_modified. | open |
| T-66-25 | D | live rows on this host | medium | mitigate | Same harness as T-66-23: scripts/lib/orca-tabs-live.mjs:201-213, :335-336; scripts/lib/orca-run.mjs:81-84; the verify-no-remote-agent-port-live.mjs and host-bundle probes use mkdtemp profiles and stop orcad by recorded pid. The lock is operator-applied (66-06-SUMMARY.md:134). | closed |
| T-66-26 | T | inventory/brand-tokens.json | medium | mitigate | inventory/brand-tokens.json scope.exclude is identical at 5a13abab, 0abc1e7a, 44a0dde5, 368a3f44 and HEAD (four entries from before Phase 66, no Phase 66 path). Counts were measured by the scanner on the staged tree (66-06-SUMMARY.md:222-236, scan PASS plus its self-test). | closed |
| T-66-27 | R | blocker handling | medium | mitigate | 66-06-PLAN.md:174 Task 2 is checkpoint:decision gate=blocking-human; the owner's answers are recorded as D-33 (DECISIONS.md:232-243, 'Fold into Phase 67') and D-34 (DECISIONS.md:246-263, 'Add them from PB's side now') for the clause (j) blocker, and 66-07 acts on D-34. | closed |
| T-66-SC (66-06) | T | npm/pip/cargo installs | high | mitigate | scripts/build-orca.sh:194,202 pnpm install --frozen-lockfile --ignore-scripts; docs/BUILD.md:60 yarn --ignore-scripts --frozen-lockfile; docs/BUILD.md:669-672 the CLI build carries --config.verify-deps-before-run=false; theia/yarn.lock unchanged. One past deviation: 66-06 deviation 6, a one-time pnpm re-install during the first CLI build, which build-orca.sh then rebuilt. | closed |
| T-66-07-01 | T | pb-browser-host.ts followRow | low | mitigate | orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host.ts:73-78 reads only Symbol.for('powerbrowser.orca-panes.module'); :81-92 followRow wraps the row in try/catch and runs before the result call; :220-226 the same in userClosedPage. | closed |
| T-66-07-02 | I | the store row | low | mitigate | orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx:1044-1068: the row is built from about:blank, the worktree id, browserPageId and the session environment id, with staged: true and stagedClientHosted: true; no page URL and no credential. | closed |
| T-66-07-03 | D | duplicate rows after reload | low | mitigate | pb-pane-mount.tsx:1042 browserPageRows map; :1047 refuses when the map or findPage already holds the page; staged handle (:1060) so Orca's session restore drops it; :1071-1075 removal through discardStagedWebRuntimeBrowserTab. | closed |
| T-66-07-04 | I | live output and the SUMMARY | high | mitigate | pb-browser-host.ts and pb-browser-host-link.ts contain no console call; orca-browser-frontend-module.ts:244,255,367,411,427 log a step or code only; scripts/lib/orca-tabs-live.mjs:201-204 output redaction installed before anything prints; scripts/verify-orca-browser-host-bundle.mjs:552-553 redaction verdict. | closed |
| T-66-08-01 | E | adoptContentWindow / adoptLinkIn / adoptInProcessWindow | high | mitigate | PowerBrowserAPI.sys.mjs:7445 adoptLinkIn returns null for an agent opener for every where; :7484 adoptContentWindow calls agentOpenGuard before the print/null branch; :7498-7501 adoptInProcessWindow throws for an agent opener; receivers wired at :4367-4385; guard :11317-11321 throws NS_ERROR_ABORT. tab-scope opensClause (verify-orca-browser-tab-scope.mjs:633) with one plant per derived path. | closed |
| T-66-08-02 | I | window.open with features from an agent page | high | mitigate | PowerBrowserAPI.sys.mjs:11273 sets SANDBOXED_AUXILIARY_NAVIGATION (:11290) on the agent browsing context in agentTabCreated, which runs at :3656 before the first load. | closed |
| T-66-08-03 | S | an agent-opened page in the user's jar with the login manager | high | mitigate | Follows from T-66-08-01 and T-66-08-02 (both CLOSED). Live clause (n) verdictOpens in scripts/verify-orca-browser-agent-live.mjs:275-298 requires 0 tabs, 0 windows and 0 loads from agent opens, after user-side detectors. | closed |
| T-66-08-04 | T | a compromised content process clearing its own sandbox flag | low | accept | Acceptance documented: 66-08-PLAN.md threat register; D-41, DECISIONS.md:411-413 ('The remaining agent-tab risks are accepted (T-66-08-04, T-66-09-04)'); 66-08-SUMMARY.md owner items. | closed |
| T-66-08-05 | I | refusal logs | low | mitigate | PowerBrowserAPI.sys.mjs:11308-11312 logs '[orca-agent] refused a <path> from an agent page (D-35)' once per tab and path, with no URL. | closed |
| T-66-09-01 | I | download viewer in a stock window; file in the user's folder | high | mitigate | PowerBrowserAPI.sys.mjs:11273 adds SANDBOXED_DOWNLOADS (:11297, 0x10000) to the agent browsing context; :11537 and :11549-11552 count a cancelled document channel as a refused download; live (o) verdictDownloads verify-orca-browser-agent-live.mjs:301-316. | closed |
| T-66-09-02 | E | external application launched by an agent page | high | mitigate | PowerBrowserAPI.sys.mjs:11332-11354 agentProtocolWallInstall registers a dispatch chooser that refuses an agent overlay's browsing context and delegates every other load to the stock factory (:11338, :11346); installed at :11276; live (p) verdictProtocols verify-orca-browser-agent-live.mjs:318-330; tab-scope wallsClause verify-orca-browser-tab-scope.mjs:759. | closed |
| T-66-09-03 | E | stock popup from the initial about:blank | medium | mitigate | PowerBrowserAPI.sys.mjs:11765-11767 refuses every method except browser.goto while isInitialDocument is true; live (q) verdictFirstDocument verify-orca-browser-agent-live.mjs:332-345. | closed |
| T-66-09-04 | T | a compromised content process clearing its own flags | low | accept | Acceptance documented: 66-09-PLAN.md threat register; D-41, DECISIONS.md:411-413 names T-66-09-04; the chooser refusal is parent-side (PowerBrowserAPI.sys.mjs:11342-11344). | closed |
| T-66-09-05 | I | refusal logs | low | mitigate | Both refusals go through agentOpenRefused with a path word only ('download' at PowerBrowserAPI.sys.mjs:11551, 'protocol launch' at :11343); the log at :11311 carries no URL. | closed |
| T-66-09-06 | D | the settle beat delays child-run commands | low | accept | Acceptance documented: 66-09-PLAN.md threat register; D-37, DECISIONS.md:344-346 records the 100 ms beat and the 3 s cap; code PowerBrowserAPI.sys.mjs:11733-11744 carries a shortcut: comment with the upgrade path; 66-09-SUMMARY.md deviation 1. | closed |
| T-66-10-01 | T | user's clipboard replaced by an agent page | high | mitigate | powerbrowser/shell/GroupActorChild.sys.mjs:744-765 PowerBrowserAgentPageChild: at DOMWindowCreated, cancels copy/cut/paste capturing on the chrome event handler and replaces Clipboard read/readText/write/writeText with a rejected promise; registered for the agent group only, allFrames (PowerBrowserAPI.sys.mjs:11847-11855); live (r) verdictClipboard verify-orca-browser-agent-live.mjs:347-366. | closed |
| T-66-10-02 | I | user's clipboard read by an agent page or pasted by the agent | high | mitigate | Read methods refused and paste cancelled (GroupActorChild.sys.mjs:744-765); AGENT_CLIPBOARD_KEYS :320-332 refused at the top of agentPress :337-343 before any key is sent; live (r). | closed |
| T-66-10-03 | E | a user grant used silently by an agent page; notification click into clients.openWindow | medium | mitigate | pref("permissions.isolateBy.userContext", true) at powerbrowser/branding/dev/pref/firefox-branding.js:189 and powerbrowser/branding/release/pref/firefox-branding.js:189, emitted by scripts/generate.mjs:2910; tab-scope permissionsClause verify-orca-browser-tab-scope.mjs:1084; live (s) verdictPermissions verify-orca-browser-agent-live.mjs:368. | closed |
| T-66-10-04 | T | a compromised content process skipping the content wall | low | accept | Acceptance documented: 66-10-PLAN.md threat register; 66-10-SUMMARY.md:83 (a compromised content process among the accepted risks); D-41, DECISIONS.md:411-413. | closed |
| T-66-10-05 | I | Linux PRIMARY selection from the agent's own mouse or select-all selection | low | accept | Acceptance documented: D-38 residual, DECISIONS.md:380; D-41 'D-38 residual acknowledged', DECISIONS.md:408; 66-10-SUMMARY.md:81. | closed |
| Flag: T-66-05 (66-02-SUMMARY) | threat flag | page table, unbound refusal, no adoption; trace plants. Mapped to 66-02:T-66-05. Source: .planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-02-SUMMARY.md | n/a | n/a | orca-browser-dispatch.ts:29-61, :144-147, :152-154 | closed |
| Flag: T-66-06 (66-02-SUMMARY) | threat flag | agent is set only through openAgentTab and sent on the first webTabOpen only. Mapped to 66-02:T-66-06. Source: .planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-02-SUMMARY.md | n/a | n/a | web-tab.ts:984-986, :1817-1825; PowerBrowserAPI.sys.mjs:2798-2802, :3582-3586, :3655-3657 | closed |
| Flag: T-66-07 (66-02-SUMMARY) | threat flag | stale agent tabs are closed before attach. Mapped to 66-02:T-66-07. Source: .planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-02-SUMMARY.md | n/a | n/a | orca-browser-frontend-module.ts:201-206, :432-438, :415-429 | closed |
| Flag: T-66-08 (66-02-SUMMARY) | threat flag | openAgentTab never activates, and reveal follows the P66-09 rule. Mapped to 66-02:T-66-08. Source: .planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-02-SUMMARY.md | n/a | n/a | web-tab.ts:1817-1821; orca-pane-observer.ts:253-263; orca-browser-dispatch.ts:194-221 | closed |
| Flag: T-66-20 (66-05-SUMMARY) | threat flag | the mark draws only pushed state. Mapped to 66-05:T-66-20. Source: .planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-05-SUMMARY.md | n/a | n/a | chrome-bar-widget.tsx:1686-1700; web-tab.ts:607-614, :1506-1510 (L1; push listener web-tab.ts:741-753 has no isTrusted check) | closed |
| Flag: T-66-21 (66-05-SUMMARY) | threat flag | the next command is required to fail with browser_owner_unavailable. Mapped to 66-05:T-66-21. Source: .planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-05-SUMMARY.md | n/a | n/a | PowerBrowserAPI.sys.mjs:11809-11819, :11209-11211; verify-orca-agent-mark-live.mjs:56 | closed |
| Flag: T-66-22 (66-05-SUMMARY) | threat flag | the copy check and the reviewed set. Mapped to 66-05:T-66-22. Source: .planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-05-SUMMARY.md | n/a | n/a | chrome-bar-copy.ts:77-80; verify-shell-error-copy.mjs:585, :619-622 | closed |
| Flag: T-66-23 (66-05-SUMMARY) | threat flag | lock, scratch HOME and profile, recorded-pid teardown and redaction, all through withOrcaTabsSession. Mapped to 66-05:T-66-23. Source: .planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-05-SUMMARY.md | n/a | n/a | orca-tabs-live.mjs:201-213, :335-336; orca-browser-live.mjs:178-188; lock is operator-applied, not acquired in code | closed |
| Flag: component-override (66-09-SUMMARY) | threat flag | component-override (PowerBrowserAPI.sys.mjs): the process-wide @mozilla.org/content-dispatch-chooser;1 contract is re-pointed at a PB chooser once the first agent tab exists; non-agent loads go to the stock factory. Mapped to 66-09:T-66-09-02. Source: .planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-09-SUMMARY.md | n/a | n/a | PowerBrowserAPI.sys.mjs:11332-11354: the stock factory is taken through getClassObject (:11338), and every non-agent call is delegated (:11346). The contract is derived from the pinned LoadURI in verify-orca-browser-tab-scope.mjs wallsClause (:759), which has plants for a chooser that refuses every load and for one that passes agent loads. Residual noted in 66-VERIFICATION: the override stays installed after the last agent tab closes, and it only delegates. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward the blocking gate*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*
*Threat flag rows are listed after the plan threats, each mapped to its registered threat and its summary file. T-66-SC appears once per plan 66-01 to 66-06.*

---

## Escalations

- **66-06:T-66-24 (high, blocking).** Lanes p66-03 and p66-05 were merged with paths outside their plans' files_modified that are not Phase 64 path substitutions: scripts/verify-ext-tab-host-scope.mjs (p66-03) and scripts/verify-shell-error-copy.mjs (p66-05). The coordinator accepted both itself (66-06-SUMMARY.md:86-94), against merge rule (2) and the 66-06 prohibition, and no owner ruling is recorded. I reviewed both diffs. The first widens the messagemanagergroup write rule by exactly the agent literal inside webTabOpen. The second adds the four mark/Stop strings to EXPECTED_NAV_COPY. Owner decision needed: ratify the two out-of-scope check edits (one recorded ruling closes T-66-24), or require a re-review or revert.
- **66-01:T-66-04 (medium, non-blocking).** setPlacement in orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host-link.ts:61-71 checks only that the id is a non-empty string or null. It does not limit the placement to the id the Theia host attached with, as the mitigation states. Owner decision needed, one of: bind setPlacement to the first attached id (overlay code change); or change T-66-04's disposition to accept under T-66-01, since in-document scripts already hold the credential and can assign window.api.runtimeEnvironments.prepareBrowserClientHostPlacement directly. orcad's device check (browser_host_lease_stale, orca/src/main/runtime/browser-host/browser-host-client-page-creation.ts:47-48) still blocks placements from another device.

---

## Accepted Risks Log

Only threats with disposition accept and status CLOSED are listed. Neither OPEN threat is recorded here.

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-66-01 | T-66-01 | Acceptance documented: 66-01-PLAN.md:285, 66-01-SUMMARY.md:191-192 (owner item); STATE.md:174,177 carry owner item T-61-04; D-41 (DECISIONS.md) keeps the Phase 66 auto-mode picks. The rationale's non-writable claim holds in code: orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host-link.ts:91-97 (writable:false, configurable:false, Object.freeze). | Documented in plan and decisions (D-41) | 2026-11-20 (audit) |
| AR-66-02 | T-66-15 | Acceptance documented: 66-03-PLAN.md:299; STATE.md:139 (O2 under Blockers/Concerns) and STATE.md:176 (owner items); 66-06-SUMMARY.md Deferred Verification row O2. | Documented in plan and STATE.md owner items | 2026-11-20 (audit) |
| AR-66-03 | T-66-19 | Acceptance documented: 66-04-PLAN.md:253; scripts/gen-orca-snapshot-fixtures.mjs:25 ('Developer host only: neither agent-browser nor Chromium ships'), :90 fixture server on 127.0.0.1; agent-browser pinned at orca/package.json:235. | Documented in plan | 2026-11-20 (audit) |
| AR-66-04 | T-66-08-04 | Acceptance documented: 66-08-PLAN.md threat register; D-41, DECISIONS.md:411-413 ('The remaining agent-tab risks are accepted (T-66-08-04, T-66-09-04)'); 66-08-SUMMARY.md owner items. | Documented in plan and decisions (D-41) | 2026-11-20 (audit) |
| AR-66-05 | T-66-09-04 | Acceptance documented: 66-09-PLAN.md threat register; D-41, DECISIONS.md:411-413 names T-66-09-04; the chooser refusal is parent-side (PowerBrowserAPI.sys.mjs:11342-11344). | Documented in plan and decisions (D-41) | 2026-11-20 (audit) |
| AR-66-06 | T-66-09-06 | Acceptance documented: 66-09-PLAN.md threat register; D-37, DECISIONS.md:344-346 records the 100 ms beat and the 3 s cap; code PowerBrowserAPI.sys.mjs:11733-11744 carries a shortcut: comment with the upgrade path; 66-09-SUMMARY.md deviation 1. | Documented in plan and decisions (D-37) | 2026-11-20 (audit) |
| AR-66-07 | T-66-10-04 | Acceptance documented: 66-10-PLAN.md threat register; 66-10-SUMMARY.md:83 (a compromised content process among the accepted risks); D-41, DECISIONS.md:411-413. | Documented in plan and decisions (D-41) | 2026-11-20 (audit) |
| AR-66-08 | T-66-10-05 | Acceptance documented: D-38 residual, DECISIONS.md:380; D-41 'D-38 residual acknowledged', DECISIONS.md:408; 66-10-SUMMARY.md:81. | Documented in decisions (D-38, D-41) | 2026-11-20 (audit) |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-20 | 62 | 60 | 2 | security auditor agent (commit e0c19c54) |

### Auditor notes

**Verdict: ESCALATE**

**Phase:** 66 (PowerBrowser web tabs as Orca's browser)
**Closed:** 51/53 plan threats, plus 9 closed threat flags (60/62 register rows) | **Open:** 2 (1 blocking, 1 non-blocking)
**ASVS Level:** 1 | **block_on:** high
**Blocking open threats (high or above):** 1 (T-66-24)

**Scope**
- The register was built from the `<threat_model>` blocks of all ten plans (66-01..66-10), with threat IDs kept as written.
- T-66-SC appears six times, once each in 66-01..66-06; each is recorded with its plan.
- No plan in this phase is a superseded stub.
- Dispositions: 45 mitigate, 8 accept, 0 transfer.
- Threat flags: 9 entries.
  - 4 items in 66-02-SUMMARY, mapped to T-66-05..T-66-08.
  - 4 items in 66-05-SUMMARY, mapped to T-66-20..T-66-23.
  - 1 table row in 66-09-SUMMARY (component-override), mapped to T-66-09-02.
  - The Threat Flags sections of 66-01, 66-06, 66-07 and 66-08 say "None" and list no items.
  - No flag is unregistered.

**Accept dispositions**
- All 8 have documented acceptance outside the plan text: SUMMARY owner items, STATE.md O2, and DECISIONS.md D-37, D-38 and D-41 (lines 344-346, 380, 408, 411-413).

**Open, blocking**
- **T-66-24 (lane merges, high).** The scope gate ran but was not enforced for two lanes, and the coordinator accepted the exceptions itself. See Escalations. The two edits look harmless on review, but the control exists to stop exactly this, and no owner ruling is recorded.

**Open, non-blocking**
- **T-66-04 (placement override, medium).** The PowerBrowser-side restriction the mitigation describes is not in the code. Only orcad's cross-device check exists.

**Caveats that do not change any status (L1 only)**
- **T-66-20:** the web-tab push listener (theia/extensions/tab-uris/src/browser/web-tab.ts:741-753) has no isTrusted check. Script in the Theia document could forge agentControlChanged and fake or hide the mark. At L2 this would not close.
- **T-66-23 and T-66-25:** the pb-live lock is applied by the operator with flock. No live script acquires it in code. The scratch profiles, the ORCA_* scrub, the recorded-pid teardown and the redaction are all in code.
- **T-66-SC (66-06):** 66-06 deviation 6 records a one-time pnpm re-install of orca/node_modules during the first CLI build. At HEAD, docs/BUILD.md:669-672 and scripts/build-orca.sh:194,202 enforce frozen-lockfile, scripts-off installs.

**Method**
- Static reading, grep and git read commands only, at HEAD e0c19c54. No build, live row or verify script was run. No file was modified or written.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [ ] `threats_open: 0` confirmed
- [ ] `status: verified` set in frontmatter

**Approval:** pending (verdict ESCALATE; T-66-24 and T-66-04 need owner triage)
