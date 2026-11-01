---
phase: "47"
slug: "hosting-website-and-mail-d"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-22"
---

# Phase 47 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `scripts/verify-platform.sh` CHECKS registry; each script carries its own `--self-test` |
| **Config file** | none — rows are the `CHECKS=(` array in `scripts/verify-platform.sh` |
| **Quick run command** | `scripts/verify-platform.sh --only <label>` (`updates-repo-static-self-test` and sibling self-tests) |
| **Full suite command** | `scripts/verify-platform.sh --quick`; after the owner checkpoint, `scripts/verify-platform.sh --only updates-repo-static` |
| **Single-row command** | `scripts/verify-platform.sh --only <label>` |
| **Estimated runtime** | ~70 seconds (`--quick`); `updates-repo-static` a few seconds of read-only `gh api` |

---

## Sampling Rate

- **After every task commit:** `scripts/verify-platform.sh --quick` after `git add` of new files (the brand scan reads `git ls-files`)
- **After every plan wave:** `--quick` plus each new row's `--self-test`
- **Before `/gsd-verify-work`:** `--quick` green, owner checkpoint done, then `--only updates-repo-static` green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | INF-01 | TBD (planner mints T-47-NN) | Every inventoried Namecheap record resolves post-move; DNSSEC handled | manual-only (owner) | Owner: inventory capture, then per-record `dig @1.1.1.1 <name> <type>` (+ `+dnssec`), `curl` site GETs; allow 24h propagation | ❌ W0 checkpoint block | ⬜ pending |
| TBD | TBD | TBD | INF-06 | TBD | Each Cloudflare token has one named holder + RENEWALS row; sweep holds no token | static quick + manual | `! grep -rn 'CLOUDFLARE_' .github/workflows/ \| grep -v '^Binary'` (sweep holds none) + RENEWALS rows present; manual dashboard 2FA/holder confirmation | ❌ W0 row/docs | ⬜ pending |
| TBD | TBD | TBD | DIST-03 | TBD | Updates repo has no `functions/` and no `_worker.js` | full (network) + quick self-test | `scripts/verify-platform.sh --only updates-repo-static` (live `gh api`); `--only updates-repo-static-self-test` (in-memory plants) | ❌ W0 new `scripts/verify-updates-repo-static.mjs` | ⬜ pending |
| TBD | TBD | TBD | DIST-03 | TBD | Live 11-segment probe returns the descriptor; unknown target 404s | manual-only (owner) | Owner `curl` probe block (escaped-space/parens, `%3A`/`%2C`, unknown-target-404 shapes) | ❌ W0 checkpoint block | ⬜ pending |
| TBD | TBD | TBD | INF-02 | TBD | One test message each to security@/contact@/privacy@ reaches the owner | manual-only (owner) | Owner: send from a non-destination account, confirm receipt + headers; check spam before failing | ❌ W0 checkpoint steps | ⬜ pending |
| TBD | TBD | TBD | WEB-01 | TBD | Home: "PowerBrowser" spelling, footer sentence, zero version facts, zero external requests | static quick + manual | Staged-source grep (spelling, footer byte-present, no `http(s)://` in src/href/fetch, no version literals); manual live GET 200 + zero-third-party load check | ❌ W0 site sources | ⬜ pending |
| TBD | TBD | TBD | WEB-02 | TBD | /download elements incl. stable links, SHA256SUMS, attestation + login note + `--bundle`, upload-coverage statement, signing/reqs/en-US/MAR-size (pending-flagged) | static quick + manual | Staged `download.html` element-presence grep; manual live GET 200 | ❌ W0 site sources | ⬜ pending |
| TBD | TBD | TBD | WEB-03 | TBD | /legal: PolyForm Noncommercial 1.0.0, trademark lines, LICENSING.md + THIRD-PARTY-NOTICES links | static quick | Staged `legal.html` grep for licence string (= `license = "PolyForm Noncommercial 1.0.0"` in configuration.toml) and trademark notice | ❌ W0 site sources | ⬜ pending |
| TBD | TBD | TBD | WEB-04 | TBD | `/.well-known/security.txt` served via zone feature | manual-only (owner) | Owner: dashboard Security → Settings → Security.txt Configurations (Contact `mailto:security@powerbrowser.org` + Expires); live `curl https://powerbrowser.org/.well-known/security.txt` → 200 | ❌ W0 checkpoint steps | ⬜ pending |
| TBD | TBD | TBD | WEB-05 | TBD | Pages projects deploy on push; live GET of four routes → 200, zero third-party | manual-only (owner) | Owner: create projects (empty build command, output `/`), attach custom domains; four-GET `curl` loop; zero-third-party load check | ❌ W0 checkpoint steps | ⬜ pending |
| TBD | TBD | TBD | TEL-08 | TBD | /privacy states payload, retention, processor, hosts, privacy@, postal address | static quick + manual | Staged `privacy.html` element-presence grep; manual live GET 200 | ❌ W0 site sources | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky* — task IDs, plans and waves are filled in once plans exist.

---

## Wave 0 Requirements

- [ ] `scripts/verify-updates-repo-static.mjs` — covers DIST-03 (`updates-repo-static` + `updates-repo-static-self-test` rows)
- [ ] Website staging sources (`index.html`, `download.html`, `privacy.html`, `legal.html`) — cover WEB-01/02/03 + TEL-08 static halves
- [ ] Updates staging (`_redirects` one-rule file + `default/Linux_x86_64-gcc3/update.xml` placeholder + per-target tree) — covers DIST-03 static half
- [ ] `docs/RENEWALS.md` Cloudflare token rows — cover INF-06 (file itself is Phase 42 DOC-04; if absent, this phase stages its rows as an appended block the DOC-04 plan adopts)
- [ ] Checkpoint command blocks (DNS inventory/verify, Email Routing, security.txt, Pages attach, four GETs, 11-segment probes, test messages) — cover every manual-only row above
- [ ] Framework install: none — `gh`, `curl`, `node` all present; `dig` via fallback chain (`getent`/`python`/`nix shell nixpkgs#bind.dnsutils`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Post-move DNS resolution per inventoried record | INF-01 | Propagation delay, owner credentials | Owner runs the checkpoint inventory + `dig @1.1.1.1` block; every record resolves; allow 24h |
| Cloudflare token holders + 2FA | INF-06 | Dashboard-only confirmation | Owner confirms 2FA on, one named holder per token, RENEWALS rows dated |
| Live 11-segment `_redirects` probe + unknown-target 404 | DIST-03 | Public-Internet GET against the live host | Owner `curl` probe block; real descriptor bytes on the known target, 404 on the unknown target |
| Three test messages reach the owner | INF-02 | Human mailbox delivery | Owner sends from a non-destination account to each address, confirms receipt + headers |
| Zone security.txt served | WEB-04 | Dashboard-only feature | Owner enables Security.txt Configurations; live `curl .../.well-known/security.txt` → 200 |
| Four page GETs → 200, zero third-party | WEB-05 | Public-Internet GET + human load inspection | Owner `curl` loop over `/ /download /privacy /legal`; page loads make zero third-party requests |
| Home/download/legal/privacy content lines | WEB-01/02/03, TEL-08 | Human-readable copy on the live host | Live GET 200 + staged-source grep agreement; postal-address line owner-filled at checkpoint |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
