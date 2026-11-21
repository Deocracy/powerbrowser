# Result: G3b-pane-hosting

Branch: worktree-agent-a69304f0abf3932a2   Base: 0f9f2735401a08132a479c95c09c53f03015fa19   Final: f27f9672 (last code commit of the follow-up round; this record is committed on top; first round ended at 2026b614)

Shared cause, fixed once (51d35ba9 with the backend half in 77663522): the pane bundle boot is now one
promise that resolves at the first boot that succeeds, a failed attempt is retried (2 s doubling to
30 s, at once on Reconnect or when chrome reports ready again), handOff returns nothing until both
bridge files are written, a restart of orcad is tracked as pending until the re-pair ends, a failed
boot shows pairing-lost with Reconnect (files-missing when the failure is final, 78a2a184), and a hosted
tab closes locally until the bundle has booted. A retry replaces a failed stylesheet link and leaves no
loader script behind (891fd387).

| ID | Status | Commit | Check | Note |
|---|---|---|---|---|
| 67-CR-01 | fixed | 51d35ba9 | verify-orca-pane-hosting.mjs::restart-repair | restart pending, page holds 'restarting' through 'starting', poll stays up, re-pair at ready; reads an optional reply generation (handoff G2) |
| theia-pane-hosting-02 | fixed | 0b8e1d12 | verify-orca-pane-hosting.mjs::reveal-no-focus | store activation uses revealWidget, never activateWidget (behaviour change, D-34) |
| theia-pane-hosting-01 = 64-CR-02 | fixed | 51d35ba9 | verify-orca-pane-hosting.mjs::close-unbooted | close disposes locally while the bundle has not booted; Orca close once booted |
| pairing-credentials-01 | fixed | 77663522, 51d35ba9, 891fd387 | verify-orca-pane-hosting.mjs::handoff-both-files, ::boot-retry, ::retry-assets | handOff waits for orca-panes-dir; a failed load is retried under a new import query |
| 67-WR-01 | fixed | 77663522, 51d35ba9 | verify-orca-pane-hosting.mjs::stuck-no-offer, ::handoff-folder-refused | stuck boot with no offer reports offer-missing; a non-private or unreadable folder is refused offer-unreadable |
| 67-WR-02 | fixed | 51d35ba9, 78a2a184 | verify-orca-pane-hosting.mjs::boot-failed-page, ::boot-final | failed boot shows pairing-lost (frontend only); Reconnect retries the boot (30 s bound); a final (React identity) failure shows files-missing (Reinstall, Details) and stops the poll |
| 67-WR-04 | fixed on the frontend; NOT closed until G1a and G2 land the chrome half | 51d35ba9 | verify-orca-pane-hosting.mjs::reason-cleared | frontend sends { kind: 'orcaStatus', clientReason: null } on recovery; chrome's diagnostics row stays stale until G1a accepts the form and G2 adds OrcaService.clientRecovered |
| 65-WR-04 | fixed | 70d3b6df | verify-orca-pane-hosting.mjs::page-writeback, ::settings-writeback | 'terminal' written when a non-page main tab activates, Settings part collapses, or the left panel leaves Orca |
| 67-WR-03 | fixed on the backend; NOT closed until G2 lands the chrome half | 77663522 | verify-orca-pane-hosting.mjs::handoff-orcad-port, ::handoff-orcad-port-unknown | port from POWERBROWSER_ENV.POWERBROWSER_ORCA_PORT; refused on POSIX when absent. MERGE-BLOCKING: until G2 passes the port, every offer is refused |
| 64-WR-01 | fixed | 77663522, 51d35ba9, 891fd387 | verify-orca-pane-hosting.mjs::handoff-both-files, ::boot-retry, ::retry-assets | same as pairing-credentials-01; a retry replaces a failed stylesheet link and removes the previous loader script; a bootstrap-step retry needs the overlay half (handoff G3a) |
| theia-pane-hosting-04 | fixed | f1a705ab, 35884783, 05a68569 | verify-mode-store-migration.mjs::shipped-name-renamed, ::snapshot-follows-rename, ::write-order | colliding custom mode kept as "<name> (custom)"; ModeService.resolveModeId maps the old id for the perspective layout, SetupsService.applySnapshot (session and named Setups) and modeLabelFor; every modes.json write goes through one queue; new notice copy (red by design) |
| theia-pane-hosting-03 | fixed | e1b7e898 | verify-mode-store-migration.mjs::references-unknown; verify-orca-pane-hosting.mjs::prune-unknown | referencedTabUris returns undefined when unknown; prune skipped |
| pairing-credentials-04 | not-fixed | 51d35ba9 (comment only) | no-check: revocation is chrome-side | hosting-status header now states the token row survives; revocation handed to G2, lifetime is an owner call |
| sidecar-gate-backends-01 | not-fixed | - | no-check: no fix made | a document CSP needs live validation (Theia webviews, workers, Monaco, the inline module loader); lanes cannot launch the browser |
| 64-WR-03 (from G3a) | fixed | fe936898 | verify-orca-pane-hosting.mjs::terminal-rekey | planPanes re-keys a leaf-less terminal widget (tracked or layout-restored) to its first leaf's key; the observer moves the name, nothing is tombstoned; the widget remounts with the pane key |
| overlay-renderer-04 (from G3a, type only) | fixed | f27f9672 | no-check: an optional type field, compiled by tsc | state() type gains mountErrorsTotal?: number |
| theia-pane-hosting-05 | fixed | 8bd2b008 | verify-orca-pane-hosting.mjs::creating-closed, ::creating-refused | whilePendingCreation now read: opener refuses once the store reported none pending; first report closes a restored one |

## Registry requests
- verify-orca-pane-hosting.mjs: quick, `"orca-pane-hosting|node $REPO_ROOT/scripts/verify-orca-pane-hosting.mjs"` and `"orca-pane-hosting-self-test|node $REPO_ROOT/scripts/verify-orca-pane-hosting.mjs --self-test"`
- verify-mode-store-migration.mjs: quick, `"mode-store-migration|node $REPO_ROOT/scripts/verify-mode-store-migration.mjs"` and `"mode-store-migration-self-test|node $REPO_ROOT/scripts/verify-mode-store-migration.mjs --self-test"`
- Both read theia/node_modules/typescript and SKIP by a line without it; both share the new scripts/lib/ts-unit-loader.mjs.

## Red by design
- shell-error-copy-no-internals: the truthful rename notice is new copy (theia-pane-hosting-04). H8 must add this line to EXPECTED_MODES_COPY in scripts/verify-shell-error-copy.mjs: `'PowerBrowser now has its own "${name}" mode, so your "${name}" mode is now called "${name}".'` (the check's normalised form; source in mode-service.ts applyStoreText).
- scan-brand-residue and scan-brand-residue-self-test: inventory/brand-tokens.json counts the coincidental Orca/orca/ORCA/orcad tokens per file. This lane moved Orca 3281->3312, orca 5679->5685, ORCA 1270->1286, orcad 1786->1816 (at f27f9672) and adds unclaimed occurrences in scripts/lib/ts-unit-loader.mjs, scripts/verify-orca-pane-hosting.mjs, theia/extensions/orca-panes/src/browser/orca-pane-widget.tsx, theia/extensions/orca-panes/src/node/offer-file-policy.ts and theia/extensions/orca-panes/src/node/orca-panes-backend-module.ts. G5b or integration must recount after all lanes merge: set each token row's expected_count to the observed value and add each file the scan names under "condition 4" to that token's expected_files.

## Handoffs
- G2 (MERGE-BLOCKING for 67-WR-03): powerbrowser/shell/TheiaService.sys.mjs, add `POWERBROWSER_ORCA_PORT: String(<the port OrcaService starts orcad on>)` to the sidecar environment beside POWERBROWSER_ORCA_BRIDGE_DIR, read the same way OrcaService.sys.mjs:238 does (`PowerBrowserAPI.getIntPref("powerbrowser.orca.port", 26768)`), ideally through one shared OrcaService/OrcaEnv accessor. Without it every offer is refused offer-endpoint on Linux and macOS and every hosted Orca view shows pairing-lost.
- G2: powerbrowser/shell/OrcaEnv.sys.mjs orcaStatusReply (and OrcaService), add `generation`, an integer count of orcad starts that reached ready in this session (no identifier); the frontend re-pairs whenever it changes (sturdier 67-CR-01; the frontend works without it).
- G1a + G2: powerbrowser/shell/PowerBrowserAPI.sys.mjs handleOrcaShellMessage, accept `{ kind: 'orcaStatus', clientReason: null }` (today a validation error) and call a new `OrcaService.clientRecovered()` that sets `_clientReason = null` unless it equals `OrcaEnv.ORCA_BROWSER_HOST_REASON`, then reply with the status as usual; for 67-WR-04. H2's verify-shell-request-kinds.mjs may need the new form listed.
- G3a: orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx bootstrap(), clear `booting` when the boot promise rejects and make each step safe to run again (one services root, presets applied once), so a boot retried after a failure at the pairing or bootstrap step can pair; for 64-WR-01, pairing-credentials-01 and 67-WR-02. Until then such a retry fails again at once and the page stays (no regression).
- G2: powerbrowser/shell/OrcaService.sys.mjs, after a new offer is written revoke the token row the previous offer named (its decoded pairedDeviceId) through orcad's device RPC or CLI, or request the offer with rotate; for pairing-credentials-04.

## Behaviour changes
- theia-pane-hosting-02 (D-34): selecting an Orca browser row, by the user or by an agent, brings its web tab forward but no longer moves keyboard focus into it; the user clicks into the page. Revert with 0b8e1d12.
- theia-pane-hosting-01 = 64-CR-02 (P64-11): closing a hosted Orca tab before the pane bundle has booted closes it in PowerBrowser only; if Orca still has that pane it returns as a tab once Orca boots. Revert the orca-pane-widget.tsx hunk of 51d35ba9.
- 67-CR-01 (P67-07): after Restart Orca the page shows the "starting again" (restarting) sentence until orcad is ready and the client has re-paired, instead of disappearing while orcad starts. Revert with 51d35ba9.
- 67-WR-02 / pairing-credentials-01: a pane bundle that fails to boot while Orca's server is up now shows the pairing-lost page with Reconnect instead of empty Orca tabs, and the boot is retried by itself; a final failure (the bundle's React is not Theia's) shows the files-missing page ("This build looks incomplete. Reinstall, or open Details") and polling stops. Revert with 51d35ba9 and 78a2a184.
- 67-WR-01: a bridge folder that is not private, or no offer while orcad is ready, now shows pairing-lost instead of Orca's endless waiting state. Revert with 77663522 and 51d35ba9.
- 67-WR-03: an offer whose endpoint is not the port PowerBrowser started orcad on is refused (pairing-lost), even when the file's own URL agrees with it. Revert with 77663522.
- 65-WR-04: when a non-page main-area tab comes forward, the Settings part collapses or the left panel leaves Orca, Orca's store view is set back to terminal, so the next click on the same page or on Settings acts. Revert with 70d3b6df.
- theia-pane-hosting-04: a custom mode whose name a shipped mode now has is renamed "<name> (custom)", a status-bar notice says so, modes.json is rewritten with only that name changed, and a persisted active mode, the restored session and any Setup saved in the old mode open the renamed one (the Setup list names it). Revert with f1a705ab, 35884783 and 05a68569.
- 64-WR-03: a hosted Orca terminal first shown before its layout exists keeps its tab, name (for example term1) and place when the layout appears, instead of closing and reopening as the next name. Revert with fe936898.
- theia-pane-hosting-05: pb-orca:creating opens nothing once Orca reports no pending creation, and a creating tab restored from the layout closes at Orca's first report. Revert with 8bd2b008.

## Needs owner
- sidecar-gate-backends-01: whether to put a strict Content-Security-Policy on the Theia document (script-src 'self' with a nonce or hash for orca-pane-bundle.ts's inline module loader, object-src 'none', no unsafe-eval where Monaco allows), or to host the Orca pane bundle in a separate origin or frame. Either needs a live-verified change that lanes may not run.
- pairing-credentials-04: the token lifetime PowerBrowser accepts for an offer (revoke the previous row at each orcad start, or rotate), to be recorded in DECISIONS or INTERNAL-APIS.

## Quick gate
Follow-up round, `scripts/verify-platform.sh --quick` inside `nix develop .#theia` at f27f9672: 414 PASS, 4 FAIL, 0 SKIP,
the same four red-by-design rows as the first round. First round at 2026b614: 414 PASS, 4 FAIL, 0 SKIP
(same row set as BASE-QUICK.txt, whose extra label "redate-windows --self-test" is the driver's banner line).
All four were PASS on the base; all four are caused by this lane and are red by design (see above):
- scan-brand-residue: FAIL, red by design: coincidental Orca/orca/ORCA/orcad counts and unclaimed files; inventory recount (G5b or integration).
- scan-brand-residue-self-test: FAIL, red by design: its clean control runs the same unreconciled tree; clears with the recount.
- shell-error-copy-no-internals: FAIL, red by design: the new rename notice is not in EXPECTED_MODES_COPY (H8 adds one line).
- shell-error-copy-no-internals-self-test: FAIL, red by design: its modes-copy baseline is red for the same line; clears with it.
Also run outside the registry: verify-orca-pane-hosting.mjs PASS and --self-test PASS (21 plants);
verify-mode-store-migration.mjs PASS and --self-test PASS (9 plants); orca-pane-routes, orca-terminal-keys,
orca-browser-entry-points and orca-pane-groups PASS with their self-tests after the rekey change; every static check that reads a
touched file PASS (orca-offer-file, orca-failure-classes, orca-pane-routes, orca-browser-entry-points,
orca-terminal-keys, orca-offer-scan, orca-pairing-containment, shell-request-kinds, sidecar-origin-gate,
mode-switch-tabs-invariant, setup-roundtrip, gui09-setups-copy and the rest). The ng-029/030/031/032/033/
035/036/038 and first-boot-surface scripts are live (they need objdir/) and were not run.
