# Phase 62: Overlay gate and PowerBrowser-run orcad - Context

**Gathered:** 2026-11-09
**Status:** Ready for planning
**Mode:** Smart discuss, auto mode (Chris 2026-11-09: "Claude takes the recommended answers, keeps going"). Every P62 decision is Claude's recommended pick; Chris may override any of them before the dependent work lands or in the end-of-milestone pass (59-CONTEXT D-18).

<domain>
## Phase Boundary

PowerBrowser starts, supervises and stops its own orcad with its own profile and a scrubbed environment (RUN-03, RUN-04, RUN-05), and every change PowerBrowser makes to Orca is held to the additive overlay by a check (OVL-01, OVL-05). Success criteria are the five in ROADMAP Phase 62.

Out of scope: any Orca pane, terminal provider or browser provider (Phases 63–66); the user-facing failure page and pairing containment (RUN-06..RUN-09, Phase 67); packaging orcad into the installers (Phase 68). This phase may land the overlay gate with zero seams and zero overlay files declared: the gate must still prove it goes red on each fault.

</domain>

<decisions>
## Implementation Decisions

### OrcaService (RUN-03, criterion 1)
- **P62-01 (Claude's pick): a new `powerbrowser/shell/OrcaService.sys.mjs`, modelled on `TheiaService.sys.mjs`'s spawn / ready-sentinel / supervise / stop shape, is the only owner of the orcad process.** It is a *consumer* of `PowerBrowserAPI.sys.mjs`: every Firefox internal it needs (subprocess spawn, env, profile dir, quit observers) goes through a `PowerBrowserAPI` method with a row in `powerbrowser/INTERNAL-APIS.md`; no second file imports a Firefox internal (hard rule 2).
- **P62-02 (Claude's pick): orcad starts eagerly at launch, after the Theia sidecar reports ready, not lazily on first use of an Orca mode.** Criterion 1 says "launching PowerBrowser starts orcad"; an eager start also lets the reap-on-next-launch path run every launch. A start failure never blocks Theia: it is logged and surfaced as a diagnostics row (the failure page is Phase 67).
- **P62-03 (Claude's pick): orcad runs on the same Node binary the Theia sidecar uses (D-14), started with `--bind 127.0.0.1 --port <fixed> --json`, the port taken from one manifest key in `configuration.toml` (default chosen by research from the free loopback range the project already reserves; never 0 in the product).** The ready line is parsed as in Phase 60's `scripts/lib/orca-run.mjs`; `health.nodeVersion` and a loopback `boundEndpoint` are asserted at start.
- **P62-04 (Claude's pick): the child environment is built from an allowlist, never inherited-minus-scrub.** The allowlist is one tracked constant (names only) that both `OrcaService` and the check read: `ORCA_USER_DATA` and `ORCA_USER_DATA_PATH` both set to the `powerbrowser-orca` data root under the PowerBrowser profile, `ORCA_TELEMETRY_DISABLED=1`, `DO_NOT_TRACK=1`, `ORCA_VERSION` from the pin, plus the minimal process variables (PATH, HOME, LANG, XDG runtime). The check reads `/proc/<pid>/environ` of the running orcad and compares names as a set against the allowlist, so an inherited `ORCA_*` or a missing profile variable goes red. The socket-path length limit found in Phase 60 (108 bytes) is handled by a short runtime directory for the socket, recorded in the plan.
- **P62-05 (Claude's pick): `*.onorca.dev` gets its row in the endpoint allowlist source that `generated/endpoint-hosts.json` is built from, with the reason "Orca pairing relay (D-23)"; no other Orca host is added.**

### Hidden Electron prevention (RUN-04, criterion 2)
- **P62-06 (Claude's pick): prevention is by environment and lookup-path control, not by patching Orca.** The four installed-Orca lookup paths orcad checks (from Phase 60 research) are derived from the pinned source at check time; `OrcaService` gives orcad a HOME/XDG view in which none resolves, and the self-test plants a decoy executable at each path in a scratch root: first it proves stock orcad (plain environment) launches the decoy on a browser request, then that PowerBrowser's orcad completes the same request without launching it (decoy writes a marker file when run; the marker must be absent). An absence assertion is used only after the stock run has proven the detector fires (CLAUDE.md rule 1).

### Quit and reap (RUN-05, criterion 3)
- **P62-07 (Claude's pick): on quit, `OrcaService.stop()` asks orcad to shut down, then terminates orcad, its terminal daemon and every descendant by process group, with the same `_shuttingDown` guard and quit-observer shape `TheiaService` uses; agents end with PowerBrowser (D-07 revised).** The check records the process tree (orcad pid, `health.terminalDaemon.pid`, descendants) before quit and requires none of those PIDs alive after.
- **P62-08 (Claude's pick): on launch, before spawning, `OrcaService` reaps stale state from a killed session:** a pid/lock file in the `powerbrowser-orca` data root naming the previous orcad and daemon; if those PIDs are alive and are orcad processes of this profile they are terminated, the lock and stale socket are removed, and orcad starts on the same fixed port. The check kills PowerBrowser with SIGKILL, relaunches, and requires a ready orcad on the same port.

### Overlay gate (OVL-01, OVL-05, criteria 4 and 5)
- **P62-09 (Claude's pick): the overlay lives in one tracked directory `orca-overlay/` with `seams.json` (declared seams: upstream path, upstream blob sha at the pin, patch file, one-line reason), `patches/` (regenerated seam patches) and `files/` (PB-added files at the path they take inside the Orca tree).** `scripts/build-orca.sh` applies it after the fetch-verify and before Orca's build: copy `files/` in, apply `patches/` with the same blob-hash check `apply-patches.sh` uses (a silent no-op is a failure). Phase 62 ships it empty of seams and files; later phases add to it.
- **P62-10 (Claude's pick): one gate script `scripts/verify-orca-overlay.mjs` covers criteria 4 and 5** and registers one row plus one `-self-test` row (quick) and one built-tree row (full, SKIP with a printed line when `orca/` is absent). It derives everything at check time: the seam list from `seams.json`, each seam's upstream blob from the fetched tree at the pin, the PB-added file list from `orca-overlay/files/`, the upstream path set from `git -C orca ls-tree`. Red on: a patch that replaces a whole upstream file, a patched upstream path with no `seams.json` row, a seam count over the cap (the cap is one manifest value, default 10, D-16), a `files/` entry that shadows an upstream path at the pin, and (built-tree row) a `files/` entry that neither `build:web` nor `build:orcad` compiled (derived from the build's module graph or output map, method chosen by research). The self-test plants each fault and requires each to go red naming it.
- **P62-11 (Claude's pick): `orca-overlay/` is a tracked PowerBrowser directory that names Orca, so its files get rows under the strict brand probe (Phase 60 P60-R2) and the directory is never added to the scan's exclude list.**

### Mechanics
- **P62-12 (Claude's pick): two plans that can run as Orca lanes with disjoint files — the overlay gate (scripts, `orca-overlay/`, build-orca.sh hook) and OrcaService (chrome-side service, PowerBrowserAPI methods, INTERNAL-APIS rows, the env/decoy/quit checks) — plus the coordinator merge.** The OrcaService lane adds chrome code, so its live proofs need this workspace's objdir rebuilt with `./mach build faster` after merge (new `.sys.mjs` files are registered in `moz.build`/`jar.mn`); the lane proves what it can with the built tree it has and names the coordinator proof commands for the rest. No human checks (D-18).
- **P62-13 (Claude's pick): no user-facing copy is added in this phase.** Start, stop and reap events are log lines and diagnostics rows only; any string a user could see waits for Phase 67's page and follows the copy rule there.

### Amendments after research (Claude's picks, 2026-11-09, auto mode)
- **P62-14 (supersedes P62-06's mechanism and the "zero seams" note in the boundary):** hidden-Electron prevention is one additive seam in `src/main/orcad/orcad-browser-provider.ts`, the browser-provider file D-16 already names: `installedElectronCandidates` returns an empty list when a PowerBrowser-set switch is present in orcad's environment. Reason from the pinned source: three of the four lookup paths are absolute (`/usr/local/bin/orca-ide`, `/usr/bin/orca-ide`, `/opt/Orca/orca-ide`), only `~/.local/bin/orca-ide` moves with HOME, HOME must stay the user's (agents need `~/.claude`, git identity, ssh keys), and the lookup runs in the background at every orcad start. Phase 62 therefore ships exactly one declared seam through the overlay gate, which also gives the gate a real seam to check. The self-test uses one built orcad for both runs: without the switch a non-script ELF decoy at `~/.local/bin/orca-ide` in a scratch HOME is launched (both orcad-emitted detectors fire: `browser-sidecar-profile.json` in the data root and the `[orcad] Installed Electron browser provider unavailable` stderr line is absent/present as the research states); with the switch it is not. — **Reversibility:** costly — a seam patch must be regenerated at every re-pin (D-26) and offered upstream (D-27).
- **P62-15:** the egress row is the suffix host `.onorca.dev` with disposition `user-initiated`, not `allow`, so no privacy-page line is added in this phase (P62-13); whether orcad dials Orca hosts unattended at idle is measured by an optional row and recorded.
- **P62-16 (supersedes the manifest-key wording in P62-03):** the fixed port is a pref with default **26768** (Orca's own default 6768 is taken by a real Orca desktop on developer hosts; 26768 is below the Linux ephemeral range), overridable by tests; no manifest key, schema row or REBRANDING row is added. A busy port makes orcad exit with `pinned_port_unavailable`, which is logged and surfaced as a diagnostics row.
- **P62-17:** the overlay gate's per-seam bound is 20 changed lines; the seam-count cap stays 10 (D-16).
- **P62-18 (supersedes "by process group" in P62-07):** `stop()` signals orcad, waits up to 16 s (orcad's own stop deadline is 15 s), then signals the terminal daemon pid, then walks and terminates remaining descendants by pid; SIGTERM to orcad alone leaves the daemon and its PTYs alive. Reap-before-spawn identifies a leftover orcad by pid plus `/proc` start ticks (the `TheiaService._reapLeftoverAt` pattern) and never deletes orcad's own lock or socket files, which orcad reclaims itself. The quit check creates a real terminal session first, because an idle daemon retires itself.
- **P62-19:** `OrcaService` needs three new `PowerBrowserAPI` methods appended with `INTERNAL-APIS.md` rows (`spawnProcessExact` for an exact environment, `listProcessTree`, `addNamedReapBlocker`); existing methods and the "reap sidecar" row are not edited. orcad's stdout is never logged verbatim: the ready line carries the pairing URL, a reusable bearer credential. The data root is reached through a short alias under `$XDG_RUNTIME_DIR` (never `/tmp`) so the RPC socket path stays under the 107-byte limit. orcad's Node follows the sidecar's rule (`<GreD>/node/bin/node`, else the `powerbrowser.sidecar.nodePath` pref, else PATH), and a check compares `realpath(/proc/<orcad>/exe)` with the Theia backend's.
- **P62-20:** criterion 5's "compiled by Orca's builds" is proven by a path-derived marker literal that each PB-added source file carries and that must appear in the minified `out/web` or `out/orcad` bundle (both builds have sourcemaps off and leave no module list); the built row is vacuous until the first real overlay file lands, so the self-test fixtures carry the proof.

### Claude's Discretion
- Internal structure of `OrcaService`, the exact lock-file format, the module-graph method for criterion 5, the default port number, and test harness layout.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `.planning/workstreams/orca/ROADMAP.md` Phase 62 (five criteria) and Hard constraints; `.planning/workstreams/orca/REQUIREMENTS.md` RUN-03, RUN-04, RUN-05, OVL-01, OVL-05.
- `.planning/workstreams/orca/DECISIONS.md` — D-04 (pin, overlay), D-07 revised (agents end on quit), D-08 (telemetry off), D-10 (hidden Electron), D-14 (Node), D-16 (seam cap and named seams), D-23 (mobile protocol untouched), D-29.
- `.planning/workstreams/orca/phases/60-orca-from-source-on-theia-s-node/60-RESEARCH.md` (handshake, the four installed-Orca lookup paths, `ORCA_USER_DATA` vs `ORCA_USER_DATA_PATH`, the terminal daemon), `60-02-SUMMARY.md` (build-orca.sh steps, P60-R3/R4), `60-03-SUMMARY.md` (orca-run.mjs, socket-path limit, reaping), `60-04-SUMMARY.md` (brand rows rule).
- `powerbrowser/shell/TheiaService.sys.mjs`, `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, `powerbrowser/INTERNAL-APIS.md`, `scripts/check-internals-boundary.sh` — the service pattern and the boundary rule.
- `scripts/apply-patches.sh`, `scripts/regenerate-patches.sh`, `scripts/check-patch-surface.sh` — the patch mechanism the overlay gate mirrors.
- `scripts/build-orca.sh`, `scripts/fetch-orca.sh`, `scripts/verify-orca-pin.mjs`, `scripts/verify-orca-build-shape.mjs`, `scripts/lib/orca-run.mjs` — Phase 60 assets to extend.
- `CLAUDE.md` — hard rules, verification rules (derive and compare; absence assertions only after the emitter is proven), user-facing copy rule.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TheiaService.sys.mjs`: spawn, ready sentinel, supervise/respawn, `_shuttingDown`, quit observers, `_resolveConfigDir()` (`<profile>/powerbrowser-theia`): the template for `OrcaService` and for the `powerbrowser-orca` data root.
- `scripts/lib/orca-run.mjs`: ready-line parsing, redaction, teardown of orcad plus terminal daemon.
- `scripts/verify-crash-autosubmit-env.mjs` (Phase 59): a derived environment check with plants: the analog for the orcad environment check.
- The endpoint allowlist source and its generator/check (`generated/endpoint-hosts.json`, the egress check row).

### Established Patterns
- One registry (`scripts/verify-platform.sh`): one row plus one `-self-test` row per check; full-tier rows SKIP with a printed line.
- New chrome files are registered in `powerbrowser/shell/moz.build` / `jar.mn`; edits to chrome JS need `-purgecaches` on the next launch.
- Live runs take `flock /home/chris/coding/Power-Browser/.git/pb-live.lock`.

### Integration Points
- `OrcaService` is started from the same place `TheiaService.start()` is wired in `powerbrowser.js`, after the sidecar is ready.
- `orca-overlay/` is applied by `scripts/build-orca.sh`; later phases add seams and files to it.

</code_context>

<specifics>
## Specific Ideas

- The decoy self-test must first prove the stock path launches the decoy (criterion 2 wording), so the absence assertion is trustworthy.
- The environment check compares names as a set in both directions.

</specifics>

<deferred>
## Deferred Ideas

- Failure page, pairing-offer containment, Origin check, credential-storage check (Phase 67).
- Packaging orcad and its Node into installers (Phase 68).

</deferred>

---

*Phase: 62-overlay-gate-and-powerbrowser-run-orcad*
*Context gathered: 2026-11-09 (auto mode)*
