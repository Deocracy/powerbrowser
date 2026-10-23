# 31-01 Live Handoff — site identity tracer (Tasks 1–3)

Static work is committed; the commands below need the built browser and
the last Theia app build, which this sandbox cannot run (no `yarn`,
no Theia build, no live checks per the plan's sandbox limits).

## Session A — identity-tls live scenario

```sh
nix develop .#theia --command bash -c 'cd theia && yarn build' > "${TMPDIR:-/tmp}/pb-31-01-t1-build.log" 2>&1
node scripts/verify-site-identity-live.mjs --scenario identity-tls
```

- PASS definition: `identity-tls: PASS` with no `FAIL --`, `NOT SCORED`,
  `harness:` or `error TS` line.
- What it proves (pushed `securityState` AND DOM per case, never one
  without the other): `https://www.pb-fixture.test:18443/secure` pushes
  `secure` and the pill renders the lock icon + `Connection secure` hover
  + base-domain `<strong>` highlight + trimmed host (pill keeps the full
  URL); `http://pb-fixture.test:<plain-port>/plain` pushes `insecure`
  and the pill renders the unlock icon + `Not Secure` text with `http://`
  kept; `https://www.pb-fixture.test:18443/mixed` (an `http:` `<img>`)
  pushes `mixed-passive` and the pill renders the warning icon; the spoof
  step types `https://evil.example` on the plain tab and asserts the icon
  AND the text are unchanged (`lock derived from typed text` on red);
  the mixed-script IDN host in `localDomains` resolves to loopback and
  its pushed `displaySpec` equals `url.domainToASCII` punycode
  (`xn--pypal-fixture-w1k.test`).
- Fixture wiring (all inside the probe profile/session only): the TLS
  twin serves beside `serveNavPages` (`node:https` with
  `scripts/fixtures/tls/pb-fixture.{pem,key}`); the profile maps the
  hosts to loopback via
  `network.dns.localDomains=pb-fixture.test,www.pb-fixture.test,<idn-punycode>`
  with `security.mixed_content.upgrade_display_content=false`; the CA
  (`test-ca.pem`) is trusted via `nsIX509CertDB.addCertFromBase64`
  in that profile only.

## Session B — identity-local live scenario

```sh
node scripts/verify-site-identity-live.mjs --scenario identity-local
node scripts/verify-site-identity-live.mjs --self-test
```

- PASS definition: `identity-local: PASS` with no `FAIL --`, `NOT SCORED`,
  `harness:` or `error TS` line; `--self-test` ends `--self-test: PASS`
  with a green clean control for BOTH sessions and names `typed-lock`
  among the red plants.
- What it proves: the served-origin tab pushes `local` and the pill
  renders the host with no icon; an untitled editor shows no
  `.pb-identity`; the `typed-lock` plant (which re-inserts the original
  render-line derivation
  `this.inputValue.trim().startsWith('https://')` on the live
  `AddressBar`, the same string the static gate's absence case pins)
  goes red naming `lock derived from typed text`.
- The two sessions split the 4-tab limit: session A opens secure, plain,
  mixed and the IDN tab; session B opens one tab plus an editor.

## Task 2 — bridge gate (static; already green here, re-run after build)

```sh
node scripts/verify-web-tab-bridge.mjs
node scripts/verify-web-tab-bridge.mjs --self-test
```

- PASS definition: `verify-web-tab-bridge: PASS -- 13 webTab kinds …`
  and `--self-test: PASS -- 21 planted faults all went red`.

## Task 3 — static gate plus registry rows (already green here)

```sh
node scripts/verify-site-identity.mjs
node scripts/verify-site-identity.mjs --self-test
scripts/verify-platform.sh --quick
scripts/verify-platform.sh --only site-identity
```

- PASS definition: `verify-site-identity: PASS -- 10 cases`; self-test
  names all 10 planted faults; `--quick` green except the pre-existing
  environment rows listed in the summary (`verify-downstream-fixtures*`,
  `installer-build-proof-self-test`, `sql-store-soak*`, plus the
  pre-existing `gui07-strip-spike-verdict*` red also seen on the clean
  tree).
