# Phase 54: Review fix report

Source review: `54-REVIEW.md` (5 critical, 9 warning, 5 info). Scope: CR-01..CR-05 and WR-01..WR-09. The five Info
findings (IN-01..IN-05) were out of scope, except IN-04, which the matrix fix resolved as a side effect (one transport,
the CD-ROM device in the domain XML, the corrected `.ps1` header).

Where the verification ran: the clone `/home/chris/gsd-workspaces/deploy/dsh/phase-54`, the main checkout of branch
`dsh/phase-54` (no worktree, no network writes). `scripts/verify-platform.sh --quick` exit 0, "PASS -- all checks
passed".

Commit grouping: CR-03/WR-04/WR-07, CR-04/CR-05/WR-05/WR-08 and CR-01/CR-02/WR-01/WR-02/WR-03 each touch the same
files and the rows that guard them, so each group is one commit, green on its own.

- CR-01: FIXED 79107e3b (the Node-pin step is a node check; `build-windows-shape` executes the step's own text against the real pin and three bad fixtures; a broken filter and an accept-everything filter each plant red)
- CR-02: FIXED 79107e3b (no `get_vs.py`, no `WINSYSROOT`; `--enable-bootstrap` fetches the pinned `vs` toolchain, cited in release.yml and BLOCKED item 1; `mach repackage installer` and `mar` get every `required=True` argument, derived by the row from `mach_commands.py`; upload globs match the one output directory; live-only unknowns are in BLOCKED item 1)
- CR-03: FIXED 995c900c (`stopAndReap` waits on the Subprocess handle through `PowerBrowserAPI.waitForExit`; `signalBarePid` is Linux-gated with `ctypes.open` inside its try; every failure resolves the blocker; catalogued, boundary checks pass; the row evaluates the methods against stubs)
- CR-04: FIXED f5e0263b (a non-PASS cell is red unless it carries `deferral: {owner_approved: true, reason}`; all-FAIL, FAIL-with-evidence and unapproved-deferral plants)
- CR-05: FIXED f5e0263b (one revert, then the five cells run as a chain; `registry-before.reg` is written before install; `updater.exe` runs with its real arguments from `nsUpdateDriver.cpp:555-562`, with the version change, `update.status` and sidecar-gone assertions) - requires human verification: the guest script could not be run or linted here (no PowerShell), first run is the owner's, see BLOCKED item 6
- WR-01: FIXED 79107e3b (the job calls `package-windows.sh`, which also rewrites the package zip from the staged tree so the installer and MAR carry the sidecar; the row asserts the call, its order and plants its removal)
- WR-02: FIXED 79107e3b (`check-win-sidecar.sh`: SHA256SUMS must hash to a digest recorded outside the artifact, paths equal files present as sets, symlinks and unsafe paths refused; the producing job that records the digest does not exist yet, BLOCKED item 8, so the gate fails closed until it does)
- WR-03: FIXED 79107e3b (the hosted job records its workspace root in `BUILD_ROOT`; the purge greps it in all four slash forms, the container checkout as well, and a grep error is a failure)
- WR-04: FIXED 995c900c (only a live handle is waited on; same 3000 ms default as `stop()` (derived and compared by the row) plus 500 ms; `_pid` cleared once the exit is confirmed)
- WR-05: FIXED f5e0263b (the guest prints observations through schema markers; the writer builds `registry_diff`, `registry_residue`, `smartscreen`, `maintenance_service_enabled`, `build_target` from them; the SmartScreen text comes from a UI Automation probe and a guest-script line that prints it from source is red)
- WR-06: FIXED ec07b0d4 (synthetic plants for wrong machine i386 and arm64, PE32, `e_lfanew` past 4096, no PE signature and a synthetic ELF; the Windows stage also refuses ELF-magic files with any name)
- WR-07: FIXED 995c900c (the row parses code with acorn, so comments cannot satisfy it, and evaluates the methods against stubs; 17 plants cover each rule)
- WR-08: FIXED f5e0263b (evidence travels as files, capped with a marker; the no-residue namespace is derived from patch 040, so it expects `Software\Mozilla` while BLOCKED item 2 is open and cannot fail by construction) - the owner decision in BLOCKED item 2 itself is NOT taken here
- WR-09: FIXED 7b346a8a (`docs/RELEASING.md` describes what landed; BLOCKED.md lists the unmet 54-02 must_haves as the 54-04 gate)

Not fixed, by design: IN-01, IN-02, IN-03, IN-05 (Info, out of scope).
