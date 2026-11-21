# Result: G5b-packaging-docs

Branch: worktree-agent-a0ecbd0b36e2506eb   Base: b5c4b182   Final: 7d88c857 (last fix commit; this record is committed on top of it)

| ID | Status | Commit | Check | Note |
|---|---|---|---|---|
| packaging-prefs-network-04 | fixed (masking half handed off) | 0a218af6, b822713c, 7d88c857 | scripts/verify-orca-egress.mjs::coverage, shared, stale, source | 40 allowlist rows (30 user-initiated, 10 deny) for every host the shipped orcad bundle and the web client's URL builders name; the www.google.com, dl.google.com, cdn.jsdelivr.net, api.anthropic.com and api.openai.com allow rows now carry `orca_shared` and say what Orca sends through them; the host-only verdict still admits those Orca requests unattended (handoff) |
| packaging-prefs-network-02 | fixed | 8149f333, 05da2886, 7d88c857 | scripts/verify-packaging-staging.mjs::orca-licence; scripts/generate-licensing.mjs --self-test (Orca licence plants) | orca/LICENSE is quoted at the head of the Orca section of THIRD-PARTY-NOTICES.txt (digest-checked against inventory/licence-allowlist.json) and staged as `<GreD>/orca/LICENSE` by package-linux.sh, package-macos.sh (both modes) and package-windows.sh |
| 59-CR-01 | fixed | 9166941e | scripts/verify-legion-runner-unit.mjs::workdir | tmpfiles rule `d /var/lib/pb-runner 0750 pb-runner pb-runner -`; not deployed, the first deployment is the proof |
| 59-CR-02 | fixed | 9166941e | scripts/verify-legion-runner-unit.mjs::sandbox, podman-store | serviceOverrides relaxes the module defaults rootless podman needs; SystemCallFilter uses lib.mkForce; podman store at /var/lib/pb-runner-data outside the wiped workDir; evaluated against legion's nixos-26.05 channel, not deployed |
| packaging-prefs-network-01 | fixed (container half handed off) | 9166941e, 80835ebf | scripts/verify-legion-runner-unit.mjs::no-libvirt | pb-runner is no longer in libvirtd and the runner no longer exports LIBVIRT_DEFAULT_URI; no workflow job uses libvirt; moving the host-shell Orca and Theia builds into the container is a release.yml change (handoff) |
| 63-CR-01 | fixed | 8149f333 | scripts/verify-packaging-staging.mjs::wrapper | stage-orca-agents-wrapper.sh puts package.json and bin/claude-wrapper.mjs at `theia/node_modules/@powerbrowser/orca-agents/` on Linux and macOS; the check reads the specifier from the backend and resolves it with Node's own resolver from a staged lib/backend/main.js; Windows is inert by design (WINDOWS 53) |
| packaging-prefs-network-03 | fixed | 28820699, 7d88c857 | scripts/verify-orca-egress.mjs::privacy | the page says an agent sends what it reads to its AI provider, rewords the api.anthropic.com and api.openai.com lines, and lists the 40 Orca hosts; the list is compared with the allowlist's Orca rows as a set |
| 68-WR-02 | fixed | 8149f333 | scripts/verify-packaging-staging.mjs::checkout-grep | grep exit 2 now fails in package-linux.sh host_root_grep and in package-macos.sh's two sites (new checkout_grep) |
| 60-WR-02 | fixed | 05da2886 | scripts/generate-licensing.mjs --self-test (60-WR-02 plant and control) | a carried package's licence copy is read only when its package.json version equals the lock's, through the shared licenceText reader (LICENSE, LICENSE.md, ...); notices unchanged today (both copies are 0.3.284) |
| packaging-prefs-network-06 | not-fixed | - | - | the per-add-on fix is a policies.json ExtensionSettings entry, which this lane does not own and whose emitter/check pair would go red alone; exact change under Handoffs |
| H4 handoff (BUILD.md SKIP verdict) | fixed | b36b99b7 | no-check: documentation | docs/BUILD.md "Check exit statuses": exit 77 is a SKIP, and what --quick, --only, the full run and --gate do with it, as SKIP-PROTOCOL.md and verify-platform.sh state |
| packaging-prefs-network-05 | needs-owner | - | - | the agent-browser binary's statically linked crates have no licence file in the npm package and cannot be derived offline; ripgrep's licences already ship in out/orcad/ripgrep/licenses |

Hosts and data flows named in the allowlist and on the privacy page, with the source line that
makes or names the request (orca/ at the pin in configuration.toml; each row's reason carries the
same cite, and orca-egress::source re-checks that each cited file still names its host):

- huggingface.co: orca/src/main/speech/model-download-catalog.ts:12
- storage.googleapis.com: orca/src/main/runtime/runtime-skill-install-commands.ts:84
- nodejs.org, unofficial-builds.nodejs.org: orca/src/shared/node-runtime-pin.ts:178, :179
- avatars.githubusercontent.com: orca/src/main/github/client/map/work-item-field-coercion.ts:95
- app.orca.dev: orca/src/shared/skill-share-link.ts:2
- x.com: orca/src/renderer/src/components/stats/ShareUsageButton.tsx:114
- linear.app: orca/src/main/linear/linear-issue-comments.ts:281
- api.atlassian.com: orca/src/main/jira/gateway-base-url.ts:8
- api.bitbucket.org: orca/src/main/bitbucket/bitbucket-auth-config.ts:3
- dev.azure.com: orca/src/main/azure-devops/repository-ref.ts:86
- duckduckgo.com, www.bing.com, kagi.com (and www.google.com search): orca/src/shared/browser-url.ts:26-29
- chatgpt.com: orca/src/main/rate-limits/codex-backend-usage-client.ts:69
- cli-chat-proxy.grok.com: orca/src/main/rate-limits/grok-fetcher.ts:19; auth.x.ai: orca/src/main/rate-limits/grok-auth.ts:66
- cloudcode-pa.googleapis.com: orca/src/main/rate-limits/gemini-usage-fetcher.ts:20; oauth2.googleapis.com: orca/src/main/rate-limits/gemini-oauth-sources.ts:10
- accounts.google.com: orca/src/main/antigravity/antigravity-sign-in-url.ts:22; openidconnect.googleapis.com: orca/src/main/antigravity/google-userinfo-identity.ts:9
- dl.google.com (Orca use): orca/src/main/antigravity/antigravity-acp-runtime.ts:10
- api.kimi.com, auth.kimi.com: orca/src/main/kimi/kimi-code-runtime-auth.ts:6, :5
- api.z.ai, open.bigmodel.cn: orca/src/shared/zcode-plan-sites.ts:7, :8
- platform.minimax.io, www.minimaxi.com, platform.minimaxi.com: orca/src/main/rate-limits/minimax/minimax-request-context.ts:6, :7, :29
- opencode.ai: orca/src/main/rate-limits/opencode-go-usage-api.ts:11; cursor.com: orca/src/main/rate-limits/cursor-fetcher.ts:21
- api.anthropic.com (Orca use): orca/src/main/rate-limits/claude-oauth-usage-request.ts:19 (account usage); the Claude agent runs on the pre-installed SDK that PowerBrowser hands orcad (powerbrowser/shell/OrcaEnv.sys.mjs:157-175, loaded at orca/src/main/claude/claude-stream-json-connection.ts:38), and that SDK names api.anthropic.com (orca/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs)
- api.openai.com: only claim names in a Codex sign-in token, orca/src/main/codex-accounts/codex-auth-identity.ts:168-169; no request by Orca
- www.google.com favicons: orca/src/shared/repo-icon.ts:28, orca/src/renderer/src/lib/agent-catalog.tsx:105, orca/src/renderer/src/lib/open-in-app-catalog.tsx:73
- cdn.jsdelivr.net emoji images: the emoji-picker-react bundle in orca/out/web (assets/emoji-picker-react.esm-*.js, `https://cdn.jsdelivr.net/npm/emoji-datasource-*`)
- deny rows (never contacted): us.i.posthog.com (orca/src/main/telemetry/posthog-transport.ts:82; disabled by ORCA_TELEMETRY_DISABLED=1, powerbrowser/shell/OrcaEnv.sys.mjs:132, read at orca/src/main/telemetry/consent.ts:56), eu.i.posthog.com, us-assets.i.posthog.com, eu-assets.i.posthog.com, posthog.com (orca/node_modules/@posthog/core), sentry.io (orca/node_modules/posthog-node/dist/extensions/sentry-integration.js), json-schema.org, agent-plugins.org (orca/src/shared/skill-bundle-manifest.ts:13), www.w3.org, yandex.com: identifiers or links, not requests
- agent data flow (privacy page): what an agent reads goes to its provider because the agent is the provider's own CLI or SDK running under the user's sign-in (OrcaEnv.sys.mjs:157-175 hands orcad the Claude Agent SDK; claude-stream-json-connection.ts:38 loads it)

Whether the rate-limit fetchers poll at orcad start for a sign-in already on disk is not
established (orcad inherits HOME, OrcaEnv.sys.mjs:39). The rows are user-initiated, so an
unattended poll fails the verdict model, which surfaces it.

## Registry requests
- scripts/verify-legion-runner-unit.mjs: quick, `"legion-runner-unit|node $REPO_ROOT/scripts/verify-legion-runner-unit.mjs"` and `"legion-runner-unit-self-test|node $REPO_ROOT/scripts/verify-legion-runner-unit.mjs --self-test"`
- scripts/verify-packaging-staging.mjs: quick, `"packaging-staging|node $REPO_ROOT/scripts/verify-packaging-staging.mjs"` and `"packaging-staging-self-test|node $REPO_ROOT/scripts/verify-packaging-staging.mjs --self-test"`
- scripts/verify-orca-egress.mjs: quick, `"orca-egress|node $REPO_ROOT/scripts/verify-orca-egress.mjs"` and `"orca-egress-self-test|node $REPO_ROOT/scripts/verify-orca-egress.mjs --self-test"`

## Red by design
- scan-brand-residue (and scan-brand-residue-self-test if its baseline is the real tree): this lane adds files that name Orca and edits others. Measured with the scanner on this branch at 7d88c857: held-back "Orca" 3617 -> 3773, "orca" 6188 -> 6427, "ORCA" 1398 -> 1409, "orcad" 2220 -> 2249, "onorca" 17 -> 18, "renderOrcaSection" 6 -> 7, "runOrca(" 5 -> 6, "withOrca" 39 -> 41. Files no row claims yet: add scripts/verify-orca-egress.mjs and scripts/verify-packaging-staging.mjs to the only_in lists of the "orca", "Orca" and "ORCA" rows (verify-packaging-staging has no "ORCA"); powerbrowser/packaging/stage-orca-licence.sh to "orca", "Orca", "ORCA"; powerbrowser/packaging/stage-orca-agents-wrapper.sh to "orca", "Orca"; powerbrowser/endpoint-allowlist.json to "ORCA"; website-staging/privacy.html to "orca". inventory/brand-tokens.json belongs to integration; re-measure on the merged tree.
- orca-packaged-tree (not a quick row; it runs in release.yml after packaging, and inside package-windows.sh and package-macos.sh universal): a stage now carries `LICENSE`, so the row reports `staged but not built: LICENSE` (reproduced with `package-linux.sh --orca-stage-only`). Change needed is under Handoffs.

## Handoffs
- owner of scripts/verify-orca-packaged-tree.mjs: in the expected-set builder (after the loop that adds builtSet(b) for each --built tree, near line 116), add `expected.add('LICENSE')`, and when `orca/LICENSE` exists require the staged LICENSE to be byte-identical to it; add `LICENSE` to the self-test fixture stage. The hosted Windows and macOS artifacts carry no LICENSE, so the rule must not be "present in the built tree". For packaging-prefs-network-02.
- owner of scripts/lib/endpoint-verdict.mjs (or of orca-overlay/): the host-only verdict lets Orca's unattended requests through the www.google.com, dl.google.com and cdn.jsdelivr.net allow rows. Either make the verdict path- or initiator-aware so `www.google.com/s2/favicons`, `dl.google.com/agy-extensions/` and `cdn.jsdelivr.net/npm/emoji-datasource-*` need a user action, or replace those URLs in the overlay with local placeholders (favicons and emoji). For packaging-prefs-network-04.
- G5a or integration, .github/workflows/release.yml build-linux: run the steps "Build Orca from source at the pin" and the Theia `yarn build` inside the rootless pb-gecko-build container the way the Gecko build already runs (`podman run ... pb-gecko-build`), so third-party build code does not run in the runner's host shell; prefer just-in-time ephemeral runner registration later. The libvirt half is done here. For packaging-prefs-network-01.
- owner of powerbrowser/distribution/policies.json, with scripts/generate.mjs emitWebExtensionSettings and scripts/verify-webextensions.mjs: add `"uBlock0@raymondhill.net": { "updates_disabled": false }` to the ExtensionSettings key, emitted from powerbrowser/packaging/bundled-xpi.json. In the pinned ESR, XPIDatabase.sys.mjs:1109-1124 turns a boolean updates_disabled into AUTOUPDATE_ENABLE for that add-on, and AddonManager.sys.mjs:4591-4592 returns true there before it reads extensions.update.autoUpdateDefault, so OpenH264 (the reason that pref is false) stays off. verify-webextensions must accept an entry with no installation_mode or install_url, and website-staging/privacy.html line 70 ("A newer version it finds is not installed automatically") must then change. For packaging-prefs-network-06.
- G5a or integration, .github/workflows/release.yml windows-sidecar staging: no change now. When a Windows launcher exists (WINDOWS 53), call `bash powerbrowser/packaging/stage-orca-agents-wrapper.sh "$PWD" "$OUT"` after the lib/ copy. For 63-CR-01.

## Behaviour changes
- 59-CR-01, 59-CR-02, packaging-prefs-network-01 (54-04 runner-user libvirt access, 54 BLOCKED.md item 6): the release runner unit now creates its work directory and a persistent podman store, relaxes RestrictNamespaces, PrivateUsers, NoNewPrivileges, PrivateMounts, PrivateDevices, RestrictSUIDSGID, ProtectHostname, ProtectProc and the system-call filter for that runner only, and pb-runner is no longer in libvirtd; the owner runs the Windows matrix from the owner's own account (in libvirtd on legion) with LIBVIRT_DEFAULT_URI=qemu:///system. Not deployed; the first deployment is the proof. Revert with 9166941e and 80835ebf.
- 63-CR-01 (D-59): packaged Linux and macOS builds carry the Claude Code process wrapper, so the backend offers it and a user who installs the Claude Code extension gets an Orca pane and hook status in a packaged build, as in the dev tree. Revert with 8149f333.
- packaging-prefs-network-02: every package carries `<GreD>/orca/LICENSE`, THIRD-PARTY-NOTICES.txt quotes Orca's MIT notice, and LICENSING.md says where it ships. Revert with 8149f333 and 05da2886.
- packaging-prefs-network-03 (D-08): the public privacy page now states that an Orca agent sends what it reads (page contents, repository files, terminal output) to its AI provider, that api.anthropic.com also receives a Claude-signed-in agent's requests without an API key, and lists 40 hosts Orca contacts after an Orca feature is used. Revert with 28820699.
- packaging-prefs-network-04 (D-08): the endpoint allowlist gains 40 rows and five shared-row notes; an unattended contact of any new user-initiated host or any deny host fails the endpoint verdict (before, those hosts failed as unknown). Revert with 0a218af6 and b822713c.
- 68-WR-02: a packaging run now fails when the checkout-path grep cannot read the stage, instead of passing. Revert with 8149f333.
- 60-WR-02: the notices generator ignores a carried package's licence copy at another version than the lock and falls back to the quoted text, or fails naming it. Revert with 05da2886.

## Needs owner
- packaging-prefs-network-05: the agent-browser native binary (out/orcad/agent-browser-linux-x64 and siblings) statically links about 86 crates whose notices ship nowhere; its npm package carries only its own Apache-2.0 LICENSE. Options: build Orca with ORCAD_OMIT_AGENT_BROWSER=1 (orca/config/scripts/build-orcad.mjs:188; drops Orca's agent-browser feature), derive the crate notices at build time from the pinned agent-browser source (for example cargo-about, which needs the network, in scripts/build-orca.sh) and render them in the Orca section, or accept and record the gap.
- packaging-prefs-network-06: approve automatic updates for uBlock Origin alone (the policies.json entry under Handoffs); it narrows the owner's add-on auto-update-off posture for that one add-on.
- 59-CR-01, 59-CR-02, packaging-prefs-network-01: install systemd/legion-pb.nix on legion and record whether the unit starts and a rootless `podman run` succeeds in a job; the file names ProtectControlGroups and ProtectKernelTunables as the next settings to relax if a podman step still fails.

## Quick gate
`nix develop .#theia --command bash scripts/verify-platform.sh --quick` at b822713c: 445 rows, 437 PASS, 8 FAIL, 0 SKIP (the lane's three new checks are not registered yet, so they are not among the rows; each was run alone and passes, with its self-test). 7d88c857 changes only the two new checks' SKIP exit and b36b99b7 only docs/BUILD.md prose; neither is read by a registered row other than scan-brand-residue.

- scan-brand-residue, scan-brand-residue-self-test: FAIL, caused by this lane, red by design (counts and files above under Red by design).
- orca-service, orca-service-self-test, orca-browser-tab-scope, orca-browser-tab-scope-self-test, shell-error-copy-no-internals, shell-error-copy-no-internals-self-test: FAIL, not caused by this lane; the prompt names them red on this base by design while harness lanes fix them (orca-service's message names TheiaService.sys.mjs and orcaStatusReply, which this lane does not edit).
- Every other row PASS, as on BASE-QUICK.txt.

Checks run alone for the files touched: licensing and licensing-self-test, licence-allowlist and its self-test, privacy-hosts, bundled-xpi, theia-endpoints, webextensions, orca-credential-store, events-worker, website-publish-ready, ci-release-integrity, build-windows-shape, workflows, release-shape, manifest-literals, renovate-config, update-download-host, crash-ping-consent, bug-report and their self-tests: PASS. verify-ng-069-sidecar-egress passes its static leg and then needs a built browser (live). `package-linux.sh --orca-stage-only` ran with patchelf and staged LICENSE; `nix-instantiate --parse` and an evaluation of systemd/legion-pb.nix against legion's nixos-26.05 channel succeeded.
