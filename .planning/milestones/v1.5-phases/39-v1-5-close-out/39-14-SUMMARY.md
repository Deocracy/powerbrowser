---
phase: 39-v1-5-close-out
plan: 14
subsystem: webextensions-live-checks
tags: [EXT-10, vaultwarden, bitwarden, live-harness]
status: complete
requires: [39-13]
provides: ["scenario ext10-fill and plant vault-uri-mismatch in verify-extension-amo-live.mjs", "startVaultwarden/stopVaultwarden lifecycle"]
affects: [38-UAT row 31, 39-18 close-out records]
tech-stack:
  added: []
  patterns: ["nixpkgs store path resolved at check time (nix build --print-out-paths --no-link), no repo dependency", "extension UI driven in its own page opened in a stock-window tab"]
key-files:
  created: []
  modified:
    - scripts/verify-extension-amo-live.mjs
    - .planning/phases/38-webextensions/38-UAT.md
decisions:
  - "The local vault serves https on the TLS fixture leaf (pb-fixture.test): Bitwarden's self-hosted form refuses any non-https URL outside its dev build"
  - "The saved login uses Bitwarden's Host match detection: the default (base domain) ignores the port, so the other-port plant would otherwise still match"
  - "The fill is triggered by the extension's own autofill_login key, read from its installed manifest (Ctrl+Shift+L), pressed with the web tab focused"
metrics:
  duration: "about 75 minutes"
  completed: 2026-11-06
actuals:
  tokens: 6100
  tasks: 2
  commits: 2
plan_head_before: 350954d371f1cb0ab8bf6f03e03d1ca956d9cac3
plan_head_after: da55daeab667b6f4a4f348908e932769ad77ce07
---

# Phase 39 Plan 14: EXT-10 fill on a local Vaultwarden Summary

Scenario ext10-fill proves the Bitwarden extension, installed signed from the add-ons site and pointed through its own UI at a loopback-only, egress-blocked Vaultwarden, fills both fields of `/login` in a Theia web tab. 38 T31 option (b) is recorded as a pass.

## A5 verdict

- server URL accepted: true (https only; `http://127.0.0.1:<port>` is refused by the form, `URLs must use HTTPS.`)
- registration ok: true (through the extension's own create-account flow; Vaultwarden with no mail returns the finish-signup token directly)
- login ok: true (registration lands unlocked on the vault)

No ledger entry: A5 passed, so scope item 7 did not apply and id 27 stays free.

## What was built

- `startVaultwarden()` / `stopVaultwarden()`: `nix build --print-out-paths --no-link nixpkgs#vaultwarden` at check time; `ROCKET_ADDRESS=127.0.0.1`, a free port, `ROCKET_TLS` on `scripts/fixtures/tls/pb-fixture.{pem,key}`, a fresh `mkdtemp` `DATA_FOLDER`, `DOMAIN=https://pb-fixture.test:<port>`, `WEB_VAULT_ENABLED=false`, `SIGNUPS_ALLOWED=true`, `DISABLE_ICON_DOWNLOAD=true`, `PUSH_ENABLED=false`, `HTTP_REQUEST_BLOCK_REGEX=.*`. It waits for `/alive` over https with the fixture CA, then `vaultListenFault(ss -Hltnp)` refuses to continue unless every socket of the pid is `127.0.0.1:<port>`. Stop: SIGTERM, then SIGKILL after 10 s, then `rmSync` of the data folder, and a red if the folder still exists. The server's stdio is ignored because its log carries access tokens.
- `scenarioExt10Fill`: install, open `popup/index.html` in a stock-window tab, then use the extension's UI to skip the default-manager prompt, open Create account, select self-hosted, enter the server URL and save, enter a run-time email and continue, untick the breach check, set a run-time master password and create the account, and confirm the vault is unlocked. On web tab `/login`: the key with an empty vault leaves the form empty. A login is then saved through New login with the Host match setting, and the next press must fill both fields. Values are compared in memory. Only booleans are printed.
- Plant `vault-uri-mismatch`: the login is saved for `/login`'s port + 1, and the run goes red with `the password manager did not fill the login page`.
- Static `--self-test`: three planted `ss` listings (all-address bind, extra `[::]` socket, no listener) must each go red, and a clean 127.0.0.1-only listing must not.
- `network.dns.localDomains` for the session adds `pb-fixture.test` (the vault) and `api.pwnedpasswords.com` (nothing listens on loopback 443, so the extension's breach lookups fail locally).

No new registry row: `extension-amo-live` (all scenarios) and `extension-amo-live-self-test` (`--self-test --live`) already run every scenario and plant, and `extension-amo-live-static` runs the static self-test.

## Verification (verbatim)

```
node --check scripts/verify-extension-amo-live.mjs && node scripts/verify-extension-amo-live.mjs --self-test
  ok  listen plant all-address bind -> red: the vault server listens beyond 127.0.0.1:4100: 0.0.0.0:4100
  ok  listen plant extra socket -> red: the vault server listens beyond 127.0.0.1:4100: [::]:3012
  ok  listen plant no listener -> red: the vault server (pid 77) listens nowhere
verify-extension-amo-live --self-test: PASS -- 3 plant(s) each target a scenario, name text it emits and are read by it; every scenario has a plant; no hand-kept add-on id (the live control and plant sessions were not run)

node scripts/verify-extension-amo-live.mjs --scenario fixtures,ext10-fill   (exit 0)
fixtures: PASS -- signed installs: uBlock Origin 1.75.4 ...; Bitwarden Password Manager 2026.10.2 ...; Dark Reader 4.9.135 ... /plain went from luminance 1.00 to 0.01
ext10-fill: PASS -- Bitwarden Password Manager 2026.10.2 from https://addons.mozilla.org/firefox/downloads/file/5198653/bitwarden_password_manager-2026.10.2.xpi; its own UI accepted the local server https://pb-fixture.test:39505, registered a run-time account and unlocked (A5: {"serverAccepted":true,"registered":true,"unlocked":true,"at":"#/tabs/vault"}); on web tab /login the fill key (Ctrl+Shift+L) left the form empty with an empty vault, then filled both fields with the login saved for http://127.0.0.1:41191 (compared in memory, not printed)

node scripts/verify-extension-amo-live.mjs --self-test --live   (exit 0)
  control ext10-fill: PASS -- the clean run is green before the plant
  ok  plant vault-uri-mismatch -> red, naming 'the password manager did not fill the login page': the password manager did not fill the login page (username filled: false, password filled: false)
verify-extension-amo-live --self-test: PASS -- every control was green and every plant went red naming its drift

nix develop .#theia --command scripts/verify-platform.sh --quick   (staged)
verify-platform: PASS -- all checks passed

38-UAT row 31 check: row 31 ok
```

After every run, no `pb-vaultwarden-*` folder remained and no vaultwarden process was left running. A `git grep -i 'master.*password.*='` over the harness matches no literal secret. The only master-password value is `randomBytes(18)`.

## Deviations from Plan

1. **[Rule 3 - Blocking] https instead of http for the local server.** The extension's self-hosted form validator rejects any URL that does not start with `https://` unless the extension is a dev build. The server therefore serves the committed test-only TLS fixture leaf as `pb-fixture.test`, which is mapped to 127.0.0.1, and the session trusts the fixture CA (`live.trustFixtureCA`). The bind stays on 127.0.0.1.
2. **[Rule 1 - Correctness] Host match detection on the saved login.** Bitwarden's default match (base domain) ignores the port, so the plan's other-port plant would still have filled. Selecting Host in the item's own match-detection field makes the origin truth (scheme, host, port) hold.
3. **[Rule 2 - Privacy] Breach check egress closed.** With the popup reloaded, a request observer showed the extension contacting `https://api.pwnedpasswords.com`. The registration form's "check known data breaches" box is unticked, and that host resolves to loopback for the session.
4. **No web vault.** Registration and unlock go through the extension's own UI, so `nixpkgs#vaultwarden.webvault` is not built and `WEB_VAULT_ENABLED=false`.
5. **One code commit for both tasks.** The lifecycle and the scenario were developed in the same live session against the same file, so Task 1 and Task 2's harness code share commit f6237e4d. The UAT record is a separate commit.
6. **Backstop edges.** The empty-vault edge is scored live, because the key is pressed before any login is saved. The two-match ordering edge was not exercised: it is a backstop truth, and the shell never reorders candidates because it does not touch the fill path.

## Known Stubs

None.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: egress | scripts/verify-extension-amo-live.mjs | During a probe session (not scored), a non-extension principal requested `https://p.clarity.ms` once. Its source was not identified and is outside this plan. |

## Commits

- f6237e4d test(39-14): ext10-fill fills /login from a local Vaultwarden through the Bitwarden extension
- da55daea docs(39-14): 38-UAT row 31 pass

## Self-Check: PASSED

- scripts/verify-extension-amo-live.mjs contains `ext10-fill`, `vault-uri-mismatch`, `HTTP_REQUEST_BLOCK_REGEX`, `ROCKET_ADDRESS: '127.0.0.1'`
- f6237e4d and da55daea are ancestors of HEAD
