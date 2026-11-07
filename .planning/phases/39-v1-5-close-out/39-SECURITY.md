---
phase: "39"
slug: "v1-5-close-out"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-07"
---

# Phase 39 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Verdict of the 2026-11-07 audit (gsd-security-auditor, static only, State B from the twenty PLAN registers): **SECURED**, 50/50 threats closed (46 mitigate, 4 accept). All 17 high-severity threats are closed against implemented code or recorded owner rulings.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Harness to OS input | pb-kwin gate on every key and button event (class `powerbrowser`, empty or foreign read-back refuses); key and button events only, no `ydotool type` | synthetic uinput events on the owner's compositor |
| Screen to repository | `captureShell` / `captureActive` gate, `spectacle -a -S`, PNG size check; committed PNGs opened before commit | desktop pixels |
| Harness to local vault server | loopback bind plus `ss` check, outbound block regex, icon download off, throwaway data folder removed in `finally`, `stdio: 'ignore'`, in-memory credentials | run-time test credentials, never printed |
| Extension to tab host / stock window | unowned `moz-extension:` URL refused; caller principal on `addTab`; containers refused; patch 050 guarded (G1-G16) and byte-equal to regeneration | extension page loads |
| Patch stack to Gecko startup | the policies callback queue drains once; `_resetStartupPromises` is harness-only | startup observer topics |
| Page to chrome menu / tooltip / prompts | tooltip label set as text; save path bound to the pick-time slot; adopted-prompt visibility follows the current tab; dismissed prompts leave no mark | page-controlled strings |
| Page navigation to overlay location | `OVERLAY_LOCATION` unchanged in the phase | URLs |
| Agent to owner | blocking-human gates; verbatim dated `via AskUserQuestion` lines; CLAUDE.md edit only after the recorded approval | rulings |
| Gate and requirements records to milestone close | exclusions bound to open ledger ids at runtime; ticks and checklist re-derived from the UAT files | verification claims |
| Browser to network | endpoint allowlist unchanged; `verify-endpoints.sh` PASS | egress hosts |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-39-01 | Tampering | pb-kwin osKeys | high | mitigate | scripts/lib/pb-kwin.mjs gate before ydotool (class check, empty read-back refuses), key down/up only; plants class-mismatch, readback-empty | closed |
| T-39-02 | Repudiation | 34-UAT rewrite | medium | mitigate | every pass row in 34-UAT.md carries a verbatim evidence line | closed |
| T-39-03 | Tampering | .claude/settings.json | medium | mitigate | no phase commit touches the file (`git log --since=2026-11-04`) | closed |
| T-39-04 | Tampering | harness plant and delay wrapper | medium | mitigate | verify-page-furniture-live.mjs `releaseDismissal` in finally; no hold or plant code in powerbrowser/ or theia/ | closed |
| T-39-05 | Spoofing | page-context-menu focus return | low | accept | guard only suppresses a late `focusPage()`, never redirects focus (page-context-menu.ts latestMenuId) | closed |
| T-39-06 | Repudiation | owner rows, five UAT files | high | mitigate | 39-03-SUMMARY verbatim answers; `gate="blocking-human"`; dated `via AskUserQuestion` owner lines | closed |
| T-39-07 | Elevation of Privilege | CLAUDE.md rule 5 | high | mitigate | single edit ab61e2a9 after the 2026-11-05 owner approval recorded in 36-UAT.md; text equals 36-02-SUMMARY | closed |
| T-39-08 | Tampering | EnterprisePolicies observe() | high | mitigate | patch 050 section; upstream `callbacks.shift()` drain; guard G16 | closed |
| T-39-09 | Tampering | patches/050 new sections | high | mitigate | regenerate --check PASS; guards G14-G16; patch-guards self-test 60 plants; apply-patches self-test PASS | closed |
| T-39-10 | Elevation of Privilege | shell-only unapplied policies | medium | mitigate | fix in patch 050; pre-fix red recorded in 39-04-SUMMARY | closed |
| T-39-11 | Tampering | runtime override of upstream | medium | mitigate | `_resetStartupPromises` used only by the harness plant | closed |
| T-39-12 | Spoofing | showTooltip label | medium | mitigate | `tooltip.label = text`, no markup path; exact-text compare in the harness | closed |
| T-39-13 | Information Disclosure | harness clipboard read | low | accept | flavour lists and the harness's own sentinel only; nothing printed | closed |
| T-39-14 | Tampering | diagnostics in product code | medium | mitigate | phase diff of PowerBrowserAPI.sys.mjs has no console/dump/debug/probe hit; internals catalogue PASS | closed |
| T-39-15 | Information Disclosure | C23 diagnostics | high | mitigate | no `signon.debug` in product or scripts; probes print booleans and counts | closed |
| T-39-16 | Information Disclosure | PopupAutoComplete origin match | medium | mitigate | C23 cause was a harness pref; no product login or origin code changed | closed |
| T-39-17 | Tampering | Save As after a late answer | low | mitigate | path bound to the pick-time slot, `pageMenuSavePathOk`; slot-less late path returns `stale` | closed |
| T-39-18 | Information Disclosure | committed captures | medium | mitigate | captureShell gate + `spectacle -a -S`; PNGs opened before commit | closed |
| T-39-19 | Repudiation | 35-UAT pass rows | medium | mitigate | pass rows name scenario, plants and commit | closed |
| T-39-20 | Tampering | harness flake fixes | medium | mitigate | swallowed catches turned into `fail(...)`; 3 full runs and a 20x loop recorded; harness-only | closed |
| T-39-21 | Information Disclosure | probe screenshots | medium | mitigate | `kwinShot` headed-only via captureShell, PNG size compared to frame x scale, deleted on mismatch | closed |
| T-39-22 | Information Disclosure | X11 screen-share stream | low | accept | stream kept in the test page only; no recorder or encode path | closed |
| T-39-23 | Tampering | re-sited plants | medium | mitigate | prompts-live diff adds plant rows only, no existing expect changed | closed |
| T-39-24 | Repudiation | derived PROMPT-03 skip | high | mitigate | skip only while both REQUIREMENTS lines agree; static plants deferral-record-removed / deferral-row-removed; ledger 26 open | closed |
| T-39-25 | Tampering | prompt-probe-verdict.json | medium | mitigate | `provisional:false` with live-probe source; `--require-live-verdict` PASS | closed |
| T-39-26 | Spoofing | adopted-tab prompts over the wrong tab | high | mitigate | ADOPTED_HIDDEN / ADOPTED_SHOWN / OTHER_OVER_ADOPTED expects with plants | closed |
| T-39-27 | Spoofing | false marks from dismissed prompts | medium | mitigate | scenario dismissed-no-mark, plant dismissed-recorded | closed |
| T-39-28 | Information Disclosure | committed captures (prompts) | medium | mitigate | same gate as T-39-18; 37-T31 shows test-only values only | closed |
| T-39-29 | Repudiation | 37-UAT pass rows | medium | mitigate | pass rows cite scenario, plant and commit | closed |
| T-39-30 | Spoofing | identity box for a written about:blank popup | high | mitigate | documentPrincipal origin must equal the opener's; plant blank-hidden | closed |
| T-39-31 | Information Disclosure | stock-command error copy | medium | mitigate | stock-command-reprobe scenario and plants; `verify-shell-error-copy` PASS | closed |
| T-39-32 | Tampering | plant expect strings | low | mitigate | overlap preflight with a planted overlap; opener-null expect anchored longer, not loosened | closed |
| T-39-33 | Elevation of Privilege | foreign extension page via tabs.create | high | mitigate | unowned moz-extension URL refused; `triggeringPrincipal: principal`; plant foreign-system-principal | closed |
| T-39-34 | Tampering | container tabs, early activation | medium | mitigate | container refusal; plants container-dropped, activated-before-shown | closed |
| T-39-35 | Information Disclosure | new egress hosts from the listing page | medium | mitigate | endpoint-allowlist.json unchanged; `verify-endpoints.sh` PASS | closed |
| T-39-36 | Information Disclosure | local Vaultwarden | high | mitigate | ROCKET_ADDRESS=127.0.0.1 with `ss` check and plants; mkdtemp data removed in stopVaultwarden (finally and startup catch); icon download off, push off, HTTP_REQUEST_BLOCK_REGEX='.*' | closed |
| T-39-37 | Information Disclosure | run-time credentials | high | mitigate | randomBytes in memory; booleans only in output; `stdio: 'ignore'`; no credential literal in scripts or planning | closed |
| T-39-38 | Tampering | extension egress to bitwarden.com | medium | mitigate | self-hosted URL entered through the manager's own UI; breach host mapped to loopback; allowlist unchanged | closed |
| T-39-39 | Tampering | osKeys / osPointer | high | mitigate | gate before the move and again before the button; pointer read back on target; refusal throws; ydotool only in pb-kwin.mjs | closed |
| T-39-40 | Denial of Service | owner's live session | low | accept | short uinput sequences; refusal on window mismatch; 39-15-SUMMARY records two refusals during owner use | closed |
| T-39-41 | Information Disclosure | captureActive / PB_CAPTURE_DIR | medium | mitigate | same gate; 39-16-SUMMARY | closed |
| T-39-42 | Denial of Service | hand-started binary left running | low | mitigate | throwaway profile, killed, pgrep-checked (39-16-SUMMARY); no process alive at audit | closed |
| T-39-43 | Repudiation | 32-UAT page-tools claim | medium | mitigate | 32-UAT.md cites the registry run at 116ac682 | closed |
| T-39-44 | Elevation of Privilege | OVERLAY_LOCATION allow-list | high | mitigate | allow-list not widened: owner ruled no allow-list work (31.1-UAT row 3); line unchanged in the phase | closed |
| T-39-45 | Repudiation | batch B owner rows | high | mitigate | 39-17-SUMMARY verbatim answers; blocking-human gate; owner lines in 27/31.1/34/35/38 UATs | closed |
| T-39-46 | Tampering | window-drag regions | low | mitigate | f45bb359 changes only the Browsing strip row; 3 headed real-input runs with the frame unchanged; plant strip-drag-handle | closed |
| T-39-47 | Repudiation | GATE_KNOWN_OPEN_EXCLUSIONS | high | mitigate | a red is excused only while `ledger_entry_is_open <id>` holds, else "FAIL (exclusion no longer applies)"; all referenced ids open with repro and source | closed |
| T-39-48 | Repudiation | residual documentation | medium | mitigate | ROADMAP backlog 999.17-999.32; 39-19-SUMMARY Task 2 | closed |
| T-39-49 | Repudiation | REQUIREMENTS ticks | high | mitigate | re-derived: none of the 41 ticked ids is named by an open or pending UAT row; PAGE-05 and PROMPT-03 unticked | closed |
| T-39-50 | Repudiation | human checklist completeness | medium | mitigate | 28 pending rows across nine UATs equal the checklist's coverage (41 items) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-39-01 | T-39-05 | The focus-return guard only suppresses a late call and never redirects focus | gsd-security-auditor (plan disposition accept) | 2026-11-07 |
| AR-39-02 | T-39-13 | The harness reads clipboard flavour lists and compares text against its own sentinel, with no output | gsd-security-auditor (plan disposition accept) | 2026-11-07 |
| AR-39-03 | T-39-22 | The X11 screen-share stream stays in the test page; documented in 39-09-SUMMARY | gsd-security-auditor (plan disposition accept) | 2026-11-07 |
| AR-39-04 | T-39-40 | Short uinput sequences during owner use, refused on a window mismatch; documented in 39-15-SUMMARY | gsd-security-auditor (plan disposition accept) | 2026-11-07 |
| AR-39-05 | residual R-1 | Harness child processes (Vaultwarden, hand-started binary) are not reaped if the Node parent dies by SIGKILL or timeout; exposure is loopback-only with throwaway data | orchestrator | 2026-11-07 |
| AR-39-06 | residual R-2 | The pb-kwin gate read-back and the ydotool/spectacle call are two steps, not one atomic action (documented shortcut at pb-kwin.mjs captureActive); the pointer path re-reads before the button | orchestrator | 2026-11-07 |

Informational flags (no threat id, non-blocking): the `extensionSelectTabPage` stock-window wrapper and its ratified `STOCK_WINDOW_WRAPPERS` exemption (39-17); the token cookie copy in the private jar under permanent private browsing, hidden from extensions by patch 060's name-and-host match; one request to `p.clarity.ms` from a non-extension principal during an unscored add-ons probe session (39-14-SUMMARY), allowlist unchanged, tracked as a follow-up.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-07 | 50 | 50 | 0 | gsd-security-auditor (sonnet), orchestrated by Claude Fable 5.1 |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-07
