# Phase 47: Hosting, website and mail (D) - Research

**Researched:** 2026-10-22
**Domain:** Cloudflare Pages static hosting, DNS migration, Email Routing, static marketing/download site
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding (SEED-002 §12 recommended defaults plus the research additions): clock-only Worker (decision 1, amends SEED-002 rows 1/4/7/13); Apps only, no PATs; bot App without the Workflows permission; one release per ESR point release plus revision bumps (decision 5); static hosting on Cloudflare Pages (decision 8); `identity.fxaccounts.enabled=false` (decision 6); Safe Browsing keyfile outside the repo (decision 7); keep Cachix request first with R2 S3 fallback and keep Flathub (decision 22).
- WEB-05: `powerbrowser-website` deploys to a Cloudflare Pages project at powerbrowser.org on push to its default branch; home page carries zero per-release version facts (decision 13) and the Mozilla non-association footer sentence; security.txt is served through Cloudflare's zone-level security.txt feature (WEB-04), which avoids the Pages `.well-known` question.
- DIST-03: `powerbrowser-updates` deploys to Cloudflare Pages at updates.powerbrowser.org with one `update.xml` per channel and BUILD_TARGET plus one `_redirects` 200 rule; the full-tier row `updates-repo-static` asserts through `gh api` that the repo has no `functions/` and no `_worker.js`.
- TEL-08: /privacy states the opt-in `/events` payload (type, basename, line, column, version, buildID, OS; no message, no stack), the 30-day retention, Cloudflare as the only processor, the hosts contacted unattended, privacy@ and the postal address.
- INF-06: every Cloudflare credential has one named holder and a `docs/RENEWALS.md` row; the maintenance sweep holds no Cloudflare token and writes download counts through the telemetry Worker (TEL-11).

### Owner gates in this phase (stop points for autonomous execution)

- Every live Cloudflare and GitHub action is an owner action: creating the Cloudflare account with 2FA; the Namecheap inventory, DNSSEC-off and nameserver change (up to 24 hours to propagate); R2 enablement (a payment method may be required); creating the `powerbrowser-website` repo if absent (GH-10 created `powerbrowser-updates` and the Homebrew tap repo empty in Phase 41); creating both Pages projects and attaching the custom domains; enabling zone-level security.txt and Email Routing; sending the three test messages; running the live `_redirects` 11-segment probe and the four page GETs. Plans build everything locally — site sources, the updates-repo placeholder tree and `_redirects`, the `updates-repo-static` row and its self-test, RENEWALS rows, RELEASING.md controls text — and end with one `checkpoint:human-action` listing the exact commands, after which the live probes are run.
- Read-only `gh api` calls against the live org/repo and unauthenticated `curl` GETs against the public site/descriptors are allowed for research and for the read-back rows.

### Assumptions about unfinished dependencies

- Phase 41 is not finished (41-04 owner checkpoint pending at plan time): the `powerbrowser-updates` repo may not exist yet, neither GitHub App may be installed, and the live `repo-controls` row is not green. Plans treat the empty `powerbrowser-updates` repo as the Phase 41 deliverable and do not re-create its controls; if the repo is absent at execution time, the executor records it and stops at the owner checkpoint rather than creating org repos itself.
- WEB-02's MAR-size line uses Phase 45's PKG-21 measurement, which does not exist yet. Plans carry the measured tarball size from the local tree where derivable and mark the published MAR-size sentence as pending the Phase 45 measurement, stated explicitly in /download copy and in the plan's flagged assumption.

### Claude's Discretion

All other implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use the ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Specific Ideas (from CONTEXT.md, binding detail)

- The `_redirects` 200 rule must be probed live with the segment shapes a real client sends, including an `OS_VERSION` segment carrying a percent-escaped space and literal parentheses and a `SYSTEM_CAPABILITIES` segment carrying `%3A` and `%2C`; an unknown BUILD_TARGET must return 404, not another target's descriptor. If a placeholder does not match an escaped segment, the fallback is a minimal `_worker.js` on the same project — but the `updates-repo-static` row forbids `functions/` and `_worker.js`, so the fallback needs its own recorded decision and never lands silently.
- The home page spells the product "PowerBrowser", carries the footer sentence "DeBIOS Foundation and PowerBrowser are not officially associated with Mozilla or its products", makes zero third-party requests, and states no per-release version facts.
- /download states the attestation covers the upload rather than the legion build, notes that `gh` needs a GitHub login, and offers the offline `--bundle` alternative.

### Deferred Ideas (OUT OF SCOPE)

None — discuss phase skipped.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (from REQUIREMENTS.md) | Research Support |
|----|------------------------------------|------------------|
| INF-01 | DNS for powerbrowser.org moves from Namecheap to Cloudflare. The Namecheap records, mail forwarding and redirects are inventoried before the move, DNSSEC is off during it, and every inventoried record resolves after it. | DNS-move procedure, inventory pattern, verification commands |
| INF-06 | The Cloudflare account has 2FA, and every Cloudflare credential has one named holder: a wrangler deploy token in the scheduler and telemetry repos only; an R2 object-write token scoped to the MAR origin bucket (primary, owner ruling 2026-10-29), held only as a `release` environment secret (DIST-08); and no Cloudflare token in the maintenance sweep, which writes download counts through the telemetry Worker (TEL-11). Each token has a `docs/RENEWALS.md` row. | Credential-hygiene design, RENEWALS row shape, sweep token-absence check |
| DIST-03 | `powerbrowser-updates` deploys to Cloudflare Pages at updates.powerbrowser.org with one `update.xml` per channel and BUILD_TARGET plus one `_redirects` 200 rule. A live probe of a real 11-segment update URL, with the escapes and parentheses a client sends, returns the descriptor. The full-tier row `updates-repo-static` asserts through `gh api` that `powerbrowser-updates` has no `functions/` and no `_worker.js`; its self-test plants each in a fixture listing. | `_redirects` semantics, probe shapes, registry-row + self-test design |
| INF-02 | Cloudflare Email Routing delivers security@, contact@ and privacy@powerbrowser.org to the owner, shown by one test message to each. | Email Routing setup, test-message proof pattern |
| WEB-01 | powerbrowser.org's home page is static HTML with zero external requests and no per-release version facts. It spells the product "PowerBrowser" (fixing `index.html:348`) and carries the footer sentence "DeBIOS Foundation and PowerBrowser are not officially associated with Mozilla or its products". | Static-site content contract, zero-third-party pattern |
| WEB-02 | /download offers static `/releases/latest/download/<stable-name>` links, `SHA256SUMS`, `gh attestation verify` with a note that gh needs a GitHub login plus an offline `--bundle` alternative, and the statement that the attestation covers the upload rather than the legion build. It also gives per-OS signing status, system requirements, the en-US scope and the MAR size. | Download-page element inventory, attestation CLI shape, stable-URL shape |
| WEB-03 | /legal states the PolyForm Noncommercial 1.0.0 licence and the trademark lines, and links `LICENSING.md` and `THIRD-PARTY-NOTICES`. | Legal-page element inventory (values from configuration.toml) |
| WEB-04 | `/.well-known/security.txt` (RFC 9116) is served through Cloudflare's zone-level security.txt feature. | Zone security.txt feature procedure |
| WEB-05 | `powerbrowser-website` deploys to a Cloudflare Pages project at powerbrowser.org on push to its default branch. A live GET of `/`, `/download`, `/privacy` and `/legal` returns 200 and the page loads make zero third-party requests. | Pages project setup, multi-page resolution, live-GET verification |
| TEL-08 | /privacy states the opt-in `/events` payload (type, basename, line, column, version, buildID, OS; no message, no stack), the 30-day retention, Cloudflare as the only processor, the hosts contacted unattended, privacy@ and the postal address. | Privacy-page element inventory |

</phase_requirements>

## Summary

Phase 47 puts the project's public face live on Cloudflare's Free plan: two Pages projects (the marketing/download site at the apex, the update descriptors at `updates.`), DNS moved from Namecheap, inbound mail for three addresses, and one new full-tier registry row guarding the updates host's static-only shape. The milestone research already resolved every mechanism on paper — `_redirects` placeholder/proxy semantics, zone-level security.txt, Email Routing, Pages limits — and this phase's job is to author the local artifacts (site sources, placeholder descriptor tree, `_redirects` files, the `updates-repo-static` row with its self-test, RENEWALS rows, RELEASING.md controls text) and stop at one `checkpoint:human-action` for the owner to perform every live step.

The single genuine technical open item is the live `_redirects` probe on the 11-segment update path with real client escaping; the single genuine content conflict is the single-page website note at `docs/RELEASING.md:423-428` versus the locked multi-page WEB-05 requirement, resolved below in favour of multi-page. Everything else is standard product surface with locked copy.

**Primary recommendation:** Author four static pages plus the updates placeholder tree and `_redirects` files locally, add exactly one full-tier row (`updates-repo-static`) plus its in-memory `--self-test`, append only this phase's Cloudflare token rows to `docs/RENEWALS.md`, correct the single-page website note in `docs/RELEASING.md`, and end with one owner checkpoint — no new packages, no new drivers, no Functions, no `_worker.js`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Marketing/download/privacy/legal pages | CDN / Static (Pages) | — | Pure static HTML; no server, no build step, no client JS needed |
| Update descriptor serving | CDN / Static (Pages + `_redirects` proxy) | — | Byte-static `update.xml` per channel/target; rewrite is edge config, not compute |
| `/.well-known/security.txt` | CDN / Static (zone feature) | — | Served dynamically by the Cloudflare zone, not by either Pages project |
| Inbound mail (security@/contact@/privacy@) | Cloudflare Email Routing | Owner mailbox | Forwarding only; no mailbox, no Worker, no storage on Cloudflare |
| MAR bytes | R2 at downloads.powerbrowser.org (primary, owner ruling 2026-10-29) | GitHub Release (archival copy) | Pages caps single assets at 25 MiB; a MAR is far larger, so bytes never touch Pages |
| Static-only enforcement of updates repo | CI / verification (registry row) | — | `gh api` read-back in this repo's driver; the updates repo itself carries no checks |
| Credential holders and renewal dates | Repo docs (`docs/RENEWALS.md`) | Release-train sweep (Phase 48 reads them) | Dates are data; the sweep, not this phase, turns them into alerts |

## Project Constraints (from CLAUDE.md)

Binding directives the planner must not violate (same authority as locked decisions):

1. **One verify driver, one registry.** Adding `updates-repo-static` means appending rows to `scripts/verify-platform.sh`'s `CHECKS` array — never a sibling driver. The registry shape is `"label|command"` entries in the `CHECKS` array [VERIFIED: scripts/verify-platform.sh:3573-3578].
2. **Derive-and-compare, never hand-kept lists.** The row must derive its expectation at check time (live `gh api` listing, fixture listing in `--self-test`) and compare as set equality so additions and removals both go red.
3. **Every new row has a `--self-test` sibling** that plants each named fault and must go red naming the drift, with a green unplanted control first.
4. **Quick-tier honesty.** `--quick` means no build, no browser, no display, no network. The live `gh api` read-back is full-tier; only its in-memory `--self-test` is `--quick`.
5. **Stage new files before trusting `scan-brand-residue`.** The scan iterates `git ls-files`; an unstaged site-staging file is invisible to it.
6. **No internal identifiers in user-facing copy.** No pref key, port, timeout, sentinel, or exception text on any of the four pages. Every string names "PowerBrowser" in plain language.
7. **Nix dev shells for builds; `node` works outside them, `yarn` does not.** The new row runs on plain `node` (like `repo-controls`), never through yarn.
8. **Never edit `upstream/` or Theia core; patches regenerated, never text-edited.** Untouched by this phase (no patch or upstream contact), recorded so the planner does not route website work through either.

## Standard Stack

### Core

| Tool / Service | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| Cloudflare Pages (Free plan) | — (service) | Static hosting for both projects | Locked by owner decision 8; Git-connected deploys on push, custom domains, `_redirects` support [CITED: https://developers.cloudflare.com/pages/configuration/redirects/] |
| Cloudflare zone (Full setup) + DNS | — (service) | Apex DNS, Email Routing prerequisite, zone security.txt | Email Routing requires Cloudflare DNS [CITED: https://developers.cloudflare.com/email-service/get-started/route-emails/]; apex custom domain requires nameservers pointed at Cloudflare [CITED: https://developers.cloudflare.com/pages/configuration/custom-domains/] |
| Cloudflare Email Routing (Email Service) | — (service) | security@/contact@/privacy@ forwarding | Table-stakes inbound forwarding with per-address routing rules and destination verification [CITED: https://developers.cloudflare.com/email-service/get-started/route-emails/] |
| Cloudflare zone security.txt | — (dashboard feature) | `/.well-known/security.txt` | Avoids the open Pages `.well-known` question; managed under Security → Settings → Security.txt Configurations [CITED: https://developers.cloudflare.com/security-center/infrastructure/security-file/] |
| `gh` CLI | 2.102.0 on PATH [VERIFIED: probed this session via `gh --version`] | `updates-repo-static` live read-back; research read-only API calls | Same instrument `repo-controls` uses (`gh api -H 'X-GitHub-Api-Version: 2022-11-28'`), pinned header [VERIFIED: scripts/verify-repo-controls.mjs:42] |
| node | v24.9.0 [VERIFIED: probed this session via `node --version`] | Row scripts (`verify-*.mjs`) run on plain node | Matches the existing row convention (`node $REPO_ROOT/scripts/...`) |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| curl | 8.22.0 [VERIFIED: probed this session] | Live GET probes of pages/descriptors; `curl -sI/-s` status + body checks | Owner checkpoint probes and any read-back row needing a public GET |
| DNS lookup (dig/drill/getent/python) | absent on PATH (see Environment Availability) | Post-move resolution verification | Owner checkpoint; fallback chain documented below |
| wrangler | 4.151.3 pinned for the Workers repos [CITED: `.planning/research/v1.6-deploy/STACK.md` installation block] | `wrangler r2 object put` (Phase 49 sign job); Pages deploy debugging | NOT installed by this phase; lives in the scheduler/telemetry repos via npm, not via nix (flake carries no wrangler entry — only `pkgs.zizmor` matched) [VERIFIED: flake.nix grep this session] |
| Hand-written static HTML + inline `<style>` | — (no framework, no dependency) | The four site pages | Zero third-party requests forbids external CSS/JS/fonts; no build step keeps the Pages config at empty build command and output `/` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Zone-level security.txt | A static `.well-known/security.txt` file on Pages | Pages serving of `.well-known` is an open, unprobed question; the zone feature is documented and removes the dependency — locked by CONTEXT, do not revisit |
| `_redirects` 200 rule | Minimal `_worker.js` path-splitter on the updates project | The row under test forbids `_worker.js`; the Worker fallback needs its own recorded decision and never lands silently — locked, probe `_redirects` first |
| Multi-page site (/, /download, /privacy, /legal) | Single-page site with `/#download` + `/download /#download 302` | A 302 is not the required 200, and /privacy + /legal have no single-page home — multi-page wins; see resolution below |
| Separate `powerbrowser-website` repo | `website/` directory in the product repo | Rejected: the Pages Git integration deploys one repo per project, and the updates host already sets the one-repo-per-host pattern; the website repo is its own deployable |

**Installation:** No package installation. This phase adds zero dependencies — no `npm install`, no new workflow action, no new tool. (`wrangler@4.151.3` belongs to the future scheduler/telemetry repos, not this tree.)

## Package Legitimacy Audit

No external packages are installed or recommended by this research. The Standard Stack above names only services already chosen by owner decision, tools already on PATH, and hand-written HTML. There is therefore nothing to run through the package-legitimacy gate.

| Package | Registry | Verdict | Disposition |
|---------|----------|---------|-------------|
| (none) | — | — | No new packages; audit not applicable |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
Registrar (Namecheap) ──nameservers──▶ Cloudflare zone (Full setup, DNSSEC off during move)
                                                │
                    ┌───────────────────────────┼───────────────────────────┐
                    │                           │                           │
        Pages: powerbrowser-website    Pages: powerbrowser-updates    Email Routing
        powerbrowser.org               updates.powerbrowser.org       security@/contact@/privacy@
        /  /download  /privacy         <channel>/<target>/             ──forward──▶ owner mailbox
        /legal (static 200s)           update.xml + ONE                (verified destination,
                                       _redirects 200 rule             3 routing rules,
                                                                       3 test messages)
                    │                           │
        zone security.txt ◀── dashboard ──▶ /.well-known/security.txt (zone-served, not Pages)

GitHub Releases ──MAR bytes + SHA256SUMS + attestations──▶ /download links out (never hosted on Pages)
        │
        └── stable URLs /releases/latest/download/<stable-name>

This repo ──verify-platform.sh──▶ updates-repo-static (full-tier gh api: no functions/, no _worker.js)
                                 + --self-test (quick, in-memory fixture listings)
```

### Recommended Project Structure

New files this phase authors (planner chooses exact staging paths; website sources deploy from the separate `powerbrowser-website` repo, updates tree from `powerbrowser-updates`):

```
<website-staging>/           # mirrors powerbrowser-website repo content (owner pushes)
├── index.html               # / — zero version facts, PowerBrowser spelling, footer sentence
├── download.html            # /download — stable links, SHA256SUMS, attestation, signing, reqs, en-US, MAR size
├── privacy.html             # /privacy — TEL-08 payload lines (reviewable source; cf. docs/ model)
├── legal.html               # /legal — licence + trademark + LICENSING.md / THIRD-PARTY-NOTICES links
└── (no _redirects needed)   # multi-page: every route is a real file; no redirect lines

<updates-staging>/           # mirrors powerbrowser-updates repo content (Phase 41 deliverable)
├── _redirects               # the ONE 11-segment 200 rule
└── default/
    └── Linux_x86_64-gcc3/
        └── update.xml       # two-line no-update placeholder document

scripts/
└── verify-updates-repo-static.mjs        # new row + --self-test (gh api read-back)
docs/
├── RENEWALS.md              # append ONLY this phase's Cloudflare token rows (file itself: Phase 42 DOC-04)
└── RELEASING.md             # Cloudflare Pages section: correct the single-page note (§resolution)
```

### Pattern 1: One `_redirects` 200 rule with ten placeholders

**What:** A single dynamic rule maps the baked eleven-segment client path onto the two-segment static tree. The committed rule shape is [VERIFIED: docs/RELEASING.md:404-409]:

```
/update/6/:product/:version/:buildid/:target/:locale/:channel/:osversion/:syscaps/:dist/:distversion/update.xml  /:channel/:target/update.xml  200
```

**When to use:** Exactly this — one rule, unchanged. It fits the documented constraints: `_redirects` format is `[source] [destination] [code?]` with one redirect per line [CITED: https://developers.cloudflare.com/pages/configuration/redirects/]; placeholders (`:name`, `:[A-Za-z]\w*`) match all characters apart from the `/` delimiter in paths [CITED: same page]; proxying (`200`) supports relative same-site URLs only [CITED: same page]; the file allows up to 100 dynamic rules and this phase uses one [CITED: https://developers.cloudflare.com/pages/platform/limits/].

**Escaping note:** Percent-encoded segments (`%20`, `%3A`, `%2C`) and literal parentheses contain no raw `/`, so each still occupies exactly one segment and a placeholder matches it [ASSUMED — must survive the live probe; the CONTEXT-mandated probe shapes exist precisely to falsify this].

### Pattern 2: Static-only updates repo guarded by API read-back

**What:** The updates repo contains only static files (`update.xml` tree + `_redirects`). The `updates-repo-static` row proves it through one read-only `gh api` call listing the repo tree (recommended: `repos/{owner}/{repo}/git/trees/main?recursive=1`, single call, following the `gh api -H 'X-GitHub-Api-Version: 2022-11-28'` convention [VERIFIED: scripts/verify-repo-controls.mjs:42-74]) and fails on any path under `functions/` or a root `_worker.js`. Fail closed on non-2xx, missing/authless `gh`, or unparseable JSON — never SKIP, never PASS — mirroring the `repo-controls` fail-closed contract [VERIFIED: scripts/verify-repo-controls.mjs:20-22].

**When to use:** This row, and as the template for any future static-shape read-back. The `--self-test` twin runs fully in memory (fixture listings: clean, `functions/` plant, `_worker.js` plant), no network, no `gh`, writes nothing — mirroring the `repo-controls --self-test` in-memory plant contract [VERIFIED: scripts/verify-repo-controls.mjs:24-28].

**Why the mechanism matters:** `_redirects` rules are not applied to requests served by Pages Functions — a `functions/` route match silently disables the redirect for that route [CITED: https://developers.cloudflare.com/pages/configuration/redirects/ (Caution box)]; and a `_worker.js` in the output directory takes over the entire project's routing with `/functions` ignored [CITED: https://developers.cloudflare.com/pages/functions/advanced-mode/]. Either file's silent arrival breaks update serving without touching `_redirects`, which is why the row asserts on the repo tree rather than on the rule text.

### Pattern 3: Owner checkpoint with local-build-then-verify split

**What:** Plans author every byte locally (site sources, placeholder tree, `_redirects`, row + self-test, RENEWALS rows, RELEASING.md text) and terminate in a single `checkpoint:human-action` that lists the exact owner commands (repo creation, Pages project creation, domain attach, security.txt enablement, Email Routing rules, test messages, live probes). After the owner acts, the read-back row and `curl` GETs confirm.

**When to use:** Every live step in this phase. No executor step creates org repos, Cloudflare resources, or Apps, and no step performs any network write.

### Anti-Patterns to Avoid

- **Hand-kept expected file lists in the row.** A list copied from the tree can only agree with the tree. Derive the listing at check time and assert the *absence property* (no `functions/`, no `_worker.js`) plus set-equality where a set is genuinely derived (e.g. descriptor set vs BUILD_TARGET set once Phase 44+ defines it).
- **Absence-of-log-line assertions.** Per CLAUDE.md verification rule 1, do not assert a probe "returned nothing bad"; assert positive invariants (status code is 200, body byte-equals the repo copy, header is present).
- **Unstaged-site-files green scan.** Stage new staging files before trusting `scan-brand-residue` — it iterates `git ls-files` and an unstaged file is invisible.
- **Silent `_worker.js` fallback.** If the live probe falsifies the placeholder rule, stop and record a decision; the row forbids the file, so landing it to "fix" the probe corrupts the very invariant being guarded.
- **Version facts leaking onto `/`.** Decision 13 forbids `release.json` commits and per-release facts on the home page; the MAR-size sentence lives on /download only, and while Phase 45 is pending it is explicitly flagged as pending.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Update-URL routing on the updates host | A Worker/`_worker.js` path splitter | One `_redirects` 200 rule | Edge config, zero compute/quota, no code to review; the row forbids compute on this host |
| `security.txt` serving | A static `.well-known/` file or a Worker route | Zone-level security.txt feature | Pages `.well-known` serving is unprobed; the zone feature is documented and serves the path itself |
| Inbound mail delivery | A Worker email handler or self-hosted mailbox | Email Routing forwarding rules to the owner's verified address | No code, no storage, no new secret; Worker email handlers are for processing, not plain forwarding |
| DNS hosting after the move | Registrar DNS with manual CNAMEs | Cloudflare Full-setup zone | Required for apex Pages domains, Email Routing, and zone security.txt alike |
| Attestation verification UX | Custom signature-check instructions | `gh attestation verify` (+ `--bundle` offline alternative) | Sigstore-backed provenance already wired to Releases by `attest-build-provenance`; document the command, its login requirement, and the offline bundle path |
| Renewal tracking | A new tracker or calendar | `docs/RENEWALS.md` rows (structure owned by Phase 42 DOC-04) | One register; the Phase 48 sweep reads it |

**Key insight:** Every capability in this phase is edge configuration plus static bytes. Code is the failure mode here — each line of compute added to a static host buys a secret, a quota, and a review burden the phase requirements never ask for.

## Common Pitfalls

### Pitfall 1: Placeholder does not match an escaped segment

**What goes wrong:** The 11-segment probe with a `%20`-carrying `OS_VERSION` or `%3A`/`%2C`-carrying `SYSTEM_CAPABILITIES` segment returns 404 or the wrong descriptor.
**Why it happens:** Placeholder matching semantics against percent-encoded characters are documented only as "all characters apart from the delimiter" [CITED: redirects docs] — behaviour with real client escaping is unprobed.
**How to avoid:** Run the CONTEXT-mandated live probe shapes (escaped space + literal parens; `%3A` + `%2C`; unknown BUILD_TARGET → 404) before declaring DIST-03 done; on failure, record a decision for the `_worker.js` fallback — never land it silently.
**Warning signs:** Probe works for plain segments but fails once escaping is introduced.

### Pitfall 2: A `functions/` directory or `_worker.js` arrives silently

**What goes wrong:** A later commit (e.g. a form handler, analytics experiment) adds `functions/` or `_worker.js` to either Pages repo; `_redirects` stops applying to matched routes (or entirely) with no deploy error.
**Why it happens:** Pages treats those paths as compute opt-ins, and `_redirects` is documented as not applying to Function routes [CITED: redirects docs Caution box].
**How to avoid:** The `updates-repo-static` row asserts the absence on every full run; extend the same assertion habit to the website repo's deploy review.
**Warning signs:** A deploy preview mentions Functions; the Pages dashboard shows a Functions tab with routes.

### Pitfall 3: DNS move loses mail forwarding or redirect records

**What goes wrong:** MX-adjacent records, Namecheap email forwarding, or URL redirects inventoried incompletely; mail or redirects break after the nameserver change.
**Why it happens:** Registrar-side forwarding/redirects are not DNS records in the zone file — they live in the registrar panel and do not transfer.
**How to avoid:** Inventory-before-move must capture three classes explicitly: DNS records, mail forwarding configuration, and redirect rules; verify each class after propagation, not just A/CNAME resolution.
**Warning signs:** The inventory lists only A/CNAME/TXT rows.

### Pitfall 4: DNSSEC left on (or re-enabled early) breaks resolution

**What goes wrong:** Resolvers reject the zone during/after the move; the site and updates host go dark despite correct records.
**Why it happens:** The registrar's DS record no longer matches the new DNS operator. Cloudflare's own setup procedure orders DNSSEC off at the registrar before the nameserver change [CITED: https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/ (steps 3.3–3.5)].
**How to avoid:** DNSSEC off during the move per INF-01; re-enable only through Cloudflare after the zone is active, with the new DS uploaded.
**Warning signs:** `dig +dnssec` shows bogus/insecure states; some resolvers resolve while others SERVFAIL.

### Pitfall 5: Test message sent from the destination address proves nothing

**What goes wrong:** A test mail to security@ from the owner's own destination mailbox is discarded or filtered; delivery looks broken (or trivially passes) for the wrong reason.
**Why it happens:** Providers discard messages that appear to come from the same account they deliver to — called out in the Email Routing test procedure [CITED: https://developers.cloudflare.com/email-service/get-started/route-emails/ (Test your routing rule)].
**How to avoid:** Send each of the three test messages from an account different from the destination address; check spam before declaring failure.

### Pitfall 6: Single-page note vs multi-page requirement drift

**What goes wrong:** An executor follows `docs/RELEASING.md:423-428` (single page + `/download /#download 302`) and ships a site that fails WEB-05's four-200 requirement.
**Why it happens:** RELEASING.md predates the locked requirements; the 302 line and the missing /privacy + /legal routes contradict the success criteria.
**How to avoid:** Apply the recorded resolution (multi-page wins; correct the RELEASING.md note in this phase) and check four GETs, not one.

### Pitfall 7: MAR-size sentence stated as fact before PKG-21

**What goes wrong:** /download states a MAR size that Phase 45 later contradicts; or the size silently goes stale every release.
**Why it happens:** WEB-02's MAR-size line depends on a measurement that does not exist yet.
**How to avoid:** Carry the locally derivable tarball size where honest, flag the published MAR-size sentence explicitly as pending Phase 45 PKG-21 in both the page copy and the plan's flagged assumptions.

## Code Examples

Verified patterns from the sources consulted this session:

### The `_redirects` rule (updates project)

```
# Source: docs/RELEASING.md:404-409 (committed rule shape) + format per
# https://developers.cloudflare.com/pages/configuration/redirects/
/update/6/:product/:version/:buildid/:target/:locale/:channel/:osversion/:syscaps/:dist/:distversion/update.xml  /:channel/:target/update.xml  200
```

### Registry-row skeleton (modelled on `verify-repo-controls.mjs`)

```javascript
// Source pattern: scripts/verify-repo-controls.mjs:60-97 (ghGet + safeGetter fail-closed fetch)
// Row: updates-repo-static (full-tier). Self-test: --self-test over fixture listings.
import { execFileSync } from 'node:child_process';
const API_VERSION_HEADER = 'X-GitHub-Api-Version: 2022-11-28'; // same pin as repo-controls
export function ghGet(path) { /* execFileSync('gh', ['api', '-H', API_VERSION_HEADER, path]) */ }
// Live: GET repos/{owner}/{repo}/git/trees/main?recursive=1 (owner/repo derived from
// configuration.toml [urls] release_notes, as repo-controls does [VERIFIED: scripts/verify-repo-controls.mjs:108-120]);
// fail on any path under functions/ or equal to _worker.js; fail closed on non-2xx/auth/parse errors.
// Self-test: runChecks(treeJsonFixture) in memory — clean green first, then
// functions/x.js plant and _worker.js plant each red naming the path. No network, no gh, writes nothing.
```

### Live verification commands (owner checkpoint)

```sh
# Source shapes: Cloudflare full-setup + Email Routing test procedures (see Sources).
# Four page GETs — each must print 200 and the body must match the staged source:
for p in / /download /privacy /legal; do
  curl -s -o /tmp/pb-page.html -w "%{http_code} $p\n" "https://powerbrowser.org$p"
done
# security.txt served at zone level:
curl -s -w "\n%{http_code}\n" https://powerbrowser.org/.well-known/security.txt
# Real 11-segment probe (shapes per CONTEXT specifics; channel/target from the tree):
curl -s -o /tmp/pb-update.xml -w "%{http_code}\n" \
  "https://updates.powerbrowser.org/update/6/PowerBrowser/153.5.1/20261022000000/Linux_x86_64-gcc3/en-US/default/Debian%20GNU%2FLinux%20(5.15)/SSE2%3AMMX%2CSSE%2CSSE2/default/default/update.xml"
# Unknown BUILD_TARGET must 404, not serve another target's descriptor:
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://updates.powerbrowser.org/update/6/PowerBrowser/153.5.1/20261022000000/NO_SUCH_TARGET/en-US/default/Linux/testcaps/default/default/update.xml"
# Post-move DNS (run per inventoried record; allow up to 24h propagation):
# dig @1.1.1.1 powerbrowser.org A / dig updates.powerbrowser.org CNAME / dig powerbrowser.org MX
```

### Zero-third-party static page skeleton

```html
<!-- No external CSS/JS/fonts/analytics. All styling inline; all links relative or to
     the two known hosts (github.com Releases, powerbrowser.org itself). -->
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PowerBrowser</title>
<style>/* neutrals + one blue accent; system sans + mono for URIs (sketch-findings direction) */</style>
</head>
<body>
<!-- ... page content, no <script src>, no <link rel="stylesheet" href="http..."> ... -->
<footer>DeBIOS Foundation and PowerBrowser are not officially associated with Mozilla or its products.</footer>
</body>
</html>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-page site + `/download /#download 302` (`docs/RELEASING.md:423-428`) | Four static pages each serving 200 (locked WEB-05) | This phase (resolution recorded here) | `/download`, `/privacy`, `/legal` are real routes; no fragment redirect |
| `release.json` committed by workflows / version facts on home | No version facts on `/` (decision 13); per-release facts only on /download and in notes | Owner 2026-10-20 | Home page never goes stale; no workflow writes site data |
| Descriptor PAT for the updates repo (`docs/RELEASING.md:476` era) | Bot App token scoped to `powerbrowser-updates` | ARCHITECTURE §8 (removes one renewal row) | One fewer credential; INF-06 holder model applies |
| RELEASING.md single-page website note | Corrected multi-page + placeholder-tree text | This phase | Doc and requirements agree; Pitfall 6 closed |

**Resolution (RELEASING.md:394-429 vs WEB-05):** The single-page note — "`powerbrowser.org` serves the single-page website repository", "`/download /#download 302`", privacy "added … copied" without a route — is superseded. The locked WEB-05 text ("a live GET of `/`, `/download`, `/privacy` and `/legal` returns 200") plus success criterion 2 require four real routes; a 302 to a fragment cannot satisfy a 200, and the single-page tree has no /privacy or /legal route at all. **Multi-page wins.** This phase ships four static pages, carries no `_redirects` on the website project, and corrects the RELEASING.md website paragraph to the multi-page shape. The placeholder `default/Linux_x86_64-gcc3/update.xml` no-update document and the eleven-segment rule text in the same section stand unchanged.

**Deprecated/outdated:**
- The `/download /#download 302` line: no consumer after multi-page ships; do not carry it.
- Any plan to serve MAR bytes from Pages: Pages caps single assets at 25 MiB [CITED: https://developers.cloudflare.com/pages/platform/limits/]; MARs are served from R2 (downloads.powerbrowser.org, Phase 49).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `:placeholder` matches percent-encoded segments (`%20`, `%3A`, `%2C`) and literal parentheses as ordinary one-segment text | Architecture Patterns (Pattern 1) | The live probe fails; the recorded `_worker.js`-fallback decision triggers instead — contained by design |
| A2 | An unknown BUILD_TARGET resolves to Pages 404 via the missing static file (no explicit 404 rule needed) | Architecture Patterns, Code Examples | Probe returns 200 with wrong bytes or a generic error page; the plan must then add an explicit 404 mechanism and re-probe |
| A3 | GitHub's stable asset URL shape `/releases/latest/download/<stable-name>` serves the newest Release's asset of that name | Standard Stack / WEB-02 | /download links 404; fix is the exact documented shape — page-only change. (The linking-to-releases doc fetch truncated this session, so this stays `[ASSUMED]` pending executor confirmation against the live doc.) |
| A4 | `gh attestation verify` requires a GitHub login for API-fetched attestations, hence the login note + offline `--bundle` alternative | WEB-02 | If anonymous fetch works, the login note is merely conservative — harmless either way |
| A5 | wrangler 4.151.3 (STACK.md, 2026-10-20) is still current enough to cite for the future Workers repos | Standard Stack | Executor re-verifies at Phase 48/49 authoring time; this phase installs nothing |
| A6 | `git/trees/main?recursive=1` is available on the (possibly brand-new, near-empty) `powerbrowser-updates` repo | Architecture Patterns (Pattern 2) | Fall back to per-directory `contents/` GETs; the row's fail-closed contract already covers unreadable endpoints |
| A7 | Namecheap-side mail forwarding/redirects can be re-expressed as Cloudflare Email Routing rules + DNS records | Pitfall 3 | Some forwarding shape has no Cloudflare equivalent; the inventory step surfaces it before the move, owner decides |

**If otherwise empty:** All other claims above are `[VERIFIED]` (opened this session with path + line quotes) or `[CITED]` (fetched official docs this session).

## Open Questions

1. **Live `_redirects` behaviour on escaped segments**
   - What we know: The rule fits every documented constraint (placeholder shape, single reference each, same-site relative 200, 1/100 dynamic-rule budget) [CITED: redirects + limits docs].
   - What's unclear: Whether placeholders match `%20`/`%3A`/`%2C`/literal-paren segments in production, and what an unknown BUILD_TARGET returns.
   - Recommendation: The owner checkpoint's probe shapes (CONTEXT specifics) answer it live; plans must branch on the outcome (green → done; red → recorded `_worker.js`-fallback decision, never silent).

2. **Exact Namecheap inventory contents**
   - What we know: The pattern (records + mail forwarding + redirects, DNSSEC off, verify-everything-after) is fixed by INF-01 and Cloudflare's setup order.
   - What's unclear: The actual record set — only the owner sees the Namecheap panel.
   - Recommendation: The checkpoint's first command block is the inventory capture; nothing downstream assumes its contents.

3. **`powerbrowser-website` repo initial state**
   - What we know: GH-10 created `powerbrowser-updates` + tap repo empty in Phase 41; the website repo is created in this phase's owner gate if absent.
   - What's unclear: Whether the owner pre-creates it or the executor stages content for the owner to push.
   - Recommendation: Plans stage all four pages locally and give the owner a create-plus-push command block; if the repo already exists, the same block degrades to push-only.

4. **Postal address for /privacy (TEL-08)**
   - What we know: The page must state privacy@ and the postal address alongside the payload/retention/processor/host lines.
   - What's unclear: The address text itself — owner data, not researchable.
   - Recommendation: Page template carries a clearly-marked owner-filled line; the plan flags it as an owner input at the checkpoint.

5. **MAR-size sentence wording while PKG-21 is pending**
   - What we know: WEB-02 requires the size; Phase 45 has not measured it.
   - What's unclear: The number.
   - Recommendation: Per CONTEXT, carry the locally derivable size where honest and flag the published sentence as pending Phase 45 in copy and plan.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `gh` CLI (+ auth with repo/read:org at row runtime) | `updates-repo-static` live read-back; research read-only API | ✓ (binary; auth is owner-runtime) | 2.102.0 | None for the live row — fail closed naming `gh auth status`; `--self-test` needs no auth |
| curl | Live page/descriptor GET probes | ✓ | 8.22.0 | python3 urllib one-liners |
| node | Row scripts | ✓ | v24.9.0 | — |
| python3 | Fixture/self-test helpers if needed | ✓ | 3.13.15 | — |
| dig / drill / nslookup | Post-move DNS verification | ✗ (none on PATH) | — | `getent hosts`, python `socket`, or `nix shell nixpkgs#bind.dnsutils --command dig`; Cloudflare dashboard DNS analytics as cross-check |
| wrangler | R2/Workers work (later phases), deploy debugging | ✗ (not on PATH; not in flake — external npm per Workers repo) | pinned 4.151.3 for future repos [CITED: STACK.md] | Dashboard for this phase's owner steps; executor installs per-repo when Phase 48/49 needs it |
| Cloudflare account + 2FA | Every live step | ✗ (owner gate) | — | No fallback — owner action, plans stop at checkpoint |
| Namecheap access | Inventory + nameserver change | ✗ (owner gate) | — | No fallback — owner action |
| R2 enablement / payment method | R2 token row (DIST-08 holder) | ✗ (owner gate, needed by Phase 49) | — | Row text staged now; token minted when owner enables R2 |

**Missing dependencies with no fallback (owner gates, by design):**
- Cloudflare account with 2FA; Namecheap panel access; R2 enablement. Plans end at `checkpoint:human-action` — these never block local authoring.

**Missing dependencies with fallback:**
- dig/drill/nslookup → getent/python/nix-provided dig. wrangler → dashboard for Phase 47's steps.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `scripts/verify-platform.sh` CHECKS registry (bash driver + `node scripts/verify-*.mjs` rows) |
| Config file | none — registry is inline in `verify-platform.sh` (`local -a CHECKS=(...)`, `"label\|command"` entries) [VERIFIED: scripts/verify-platform.sh:3573-3578] |
| Quick run command | `scripts/verify-platform.sh --quick` |
| Full suite command | `scripts/verify-platform.sh` |
| Single-row command | `scripts/verify-platform.sh --only <label>` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INF-01 | Every inventoried Namecheap record resolves post-move; DNSSEC handled | manual-only | Owner: inventory capture, then per-record `dig @1.1.1.1 <name> <type>` (+ `+dnssec`), `curl` site GETs; allow 24h propagation | ❌ Wave 0 (checkpoint command block, not a script) |
| INF-06 | Each Cloudflare token has one named holder + RENEWALS row; sweep holds no token | quick (static) + manual | Quick (staged): `grep -rn` sweep workflow for `CLOUDFLARE_` secret refs must be empty; RENEWALS rows present with date + owner action. Manual: dashboard 2FA/token-holder confirmation | ❌ Wave 0 (assertion lives in new row/docs edits) |
| DIST-03 | Updates repo has no `functions/` and no `_worker.js` | full-tier (network) + quick self-test | `scripts/verify-platform.sh --only updates-repo-static` (live `gh api`); `scripts/verify-platform.sh --only updates-repo-static-self-test` (in-memory plants, no network) | ❌ Wave 0 (`scripts/verify-updates-repo-static.mjs`) |
| DIST-03 | Live 11-segment probe returns the descriptor; unknown target 404s | manual-only | Owner `curl` probe block (escaped-space/parens, `%3A`/`%2C`, unknown-target-404 shapes from Code Examples) | ❌ Wave 0 (checkpoint command block) |
| INF-02 | One test message each to security@/contact@/privacy@ reaches the owner | manual-only | Owner: send from a non-destination account, confirm receipt + headers; check spam before failing | ❌ Wave 0 (checkpoint steps + result recorded in RELEASING.md) |
| WEB-01 | Home: "PowerBrowser" spelling, footer sentence, zero version facts, zero external requests | quick (static) + manual | Quick (staged sources): `grep -c` PowerBrowser spelling; footer sentence byte-present; no `http(s)://` in `src=`/`href=`/fetch; no version-shaped literals. Manual: live GET 200 + DevTools/request-log zero-third-party check | ❌ Wave 0 (site sources + grep assertions folded into staging review) |
| WEB-02 | /download elements incl. stable links, SHA256SUMS, attestation + login note + `--bundle`, upload-coverage statement, signing/reqs/en-US/MAR-size (pending-flagged) | quick (static) + manual | Quick: element-presence grep over staged `download.html` (stable-URL shape, `gh attestation verify`, `--bundle`, login note, pending-flagged MAR line). Manual: live GET 200 | ❌ Wave 0 (site sources) |
| WEB-03 | /legal: PolyForm Noncommercial 1.0.0, trademark lines, LICENSING.md + THIRD-PARTY-NOTICES links | quick (static) | Grep staged `legal.html` for licence string (must equal `license = "PolyForm Noncommercial 1.0.0"` [VERIFIED: configuration.toml:47-50]) and trademark notice (`"PowerBrowser is a trademark of DeBIOS Foundation."` [VERIFIED: configuration.toml:47-50]) | ❌ Wave 0 (site sources) |
| WEB-04 | `/.well-known/security.txt` served via zone feature | manual-only | Owner: dashboard Security → Settings → Security.txt Configurations with Contact `mailto:security@powerbrowser.org` + Expires [CITED: security-file docs]; live `curl https://powerbrowser.org/.well-known/security.txt` → 200 | ❌ Wave 0 (checkpoint steps) |
| WEB-05 | Pages projects deploy on push; live GET of four routes → 200, zero third-party | manual-only | Owner: create projects (empty build command, output `/`), attach `powerbrowser.org` + `updates.powerbrowser.org` custom domains [CITED: custom-domains docs]; four-GET `curl` loop; zero-third-party load check | ❌ Wave 0 (checkpoint steps) |
| TEL-08 | /privacy states payload, retention, processor, hosts, privacy@, postal address | quick (static) + manual | Quick: element-presence grep over staged `privacy.html` (type/basename/line/column/version/buildID/OS, no-message-no-stack, 30-day, Cloudflare-only-processor, unattended hosts, privacy@, postal-address owner line). Manual: live GET 200 | ❌ Wave 0 (site sources) |

**Manual-only justification:** Live DNS resolution, mailbox delivery, dashboard-only features (zone security.txt, Email Routing rules, Pages project creation), and public-Internet GETs cannot run in `--quick` (no network by definition) and cannot run in CI at all (owner credentials, propagation delays, human inboxes). Each carries an exact command block at the checkpoint plus a recorded result, which is the project's established pattern for owner-gated proof (cf. `repo-controls` live row vs in-memory self-test).

### Sampling Rate

- **Per task commit:** `scripts/verify-platform.sh --quick`
- **Per wave merge:** `scripts/verify-platform.sh --quick` plus `--only updates-repo-static-self-test`
- **Phase gate:** Full suite green except the owner-gated live rows, which are proven at the checkpoint and recorded in `docs/RELEASING.md`

### Wave 0 Gaps

- [ ] `scripts/verify-updates-repo-static.mjs` — covers DIST-03 (`updates-repo-static` + `updates-repo-static-self-test` rows)
- [ ] Website staging sources (`index.html`, `download.html`, `privacy.html`, `legal.html`) — cover WEB-01/02/03 + TEL-08 static halves
- [ ] Updates staging (`_redirects` one-rule file + `default/Linux_x86_64-gcc3/update.xml` placeholder + per-target tree) — covers DIST-03 static half
- [ ] `docs/RENEWALS.md` Cloudflare token rows — cover INF-06 (file itself is Phase 42 DOC-04; if absent, this phase stages its rows as an appended block the DOC-04 plan adopts)
- [ ] Checkpoint command blocks (DNS inventory/verify, Email Routing, security.txt, Pages attach, four GETs, 11-segment probes, test messages) — cover every manual-only row above
- [ ] Framework install: none — `gh`, `curl`, `node` all present; `dig` via fallback chain

*(No existing test infrastructure covers this phase's requirements — the updates-repo row is new and every live proof is owner-gated.)*

## Security Domain

> `security_enforcement` is absent from `.planning/config.json` (keys inspected this session: no such key) — enforcement is therefore ON, and this section is required.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V1 Architecture | yes | Static-only hosts; trust boundaries drawn below; no compute on the update path |
| V2 Authentication | partial | GitHub App (no PATs, no Workflows permission) for repo writes; Cloudflare 2FA (owner, dashboard) — verified manually, not by row |
| V4 Access Control | yes | R2 token scoped to the MAR origin bucket (primary, owner ruling 2026-10-29), `release` env only; wrangler deploy token in scheduler/telemetry repos only; sweep holds no Cloudflare token (static grep + TEL-11 Worker route) |
| V5 Input Validation | yes | `_redirects` placeholders match one segment; unknown BUILD_TARGET must 404 rather than serve another target's bytes (live probe) |
| V6 Cryptography | yes | DNSSEC off-during-move then re-established; TLS terminated at Cloudflare; MAR signatures untouched by this phase (SEC-07/Phase 49) |
| V7 Errors & Logging | yes | No internal identifiers in site copy (review gate); probe failures assert positive invariants, never log-line absence |
| V8 Data Protection | yes | Email Routing forwards to a verified owner address; no mailing-list storage; /privacy states 30-day retention + Cloudflare-only processor |
| V9 Communications | yes | HTTPS-only links on /download (stable Release URLs, SHA256SUMS); `gh attestation verify` provenance check documented |
| V12 Files & Resources | yes | 25 MiB Pages asset cap respected by keeping MARs off Pages [CITED: limits docs] |
| V14 Configuration | yes | Pages projects: empty build command, output `/`; environments' branch policies unchanged by this phase (no re-plan of Phase 41 controls) |
| V3 Session Management | no | No sessions anywhere in this phase's scope (static pages, static descriptors, mail forwarding) |
| V10 Malicious Code | no | No user uploads, no rendered user input, no third-party script on any page |
| V13 API | partial | Only read-only `gh api` GETs from the row; no new API surface |

### Trust Boundaries

1. **Namecheap registrar → Cloudflare zone.** Crossed once by the nameserver change. Threat: hijack/stale-DS during the window. Control: inventory-before-move, DNSSEC-off-then-re-establish, verify-every-record-after.
2. **Git push → Pages deploy (both projects).** Threat: a malicious or mistaken commit ships to the public host. Control: `main` rulesets + required `verify` check (Phase 41, not re-planned); static-only row on the updates side.
3. **Internet → Email Routing → owner mailbox.** Threat: spoofed/forged inbound mail; misrouted sensitive reports. Control: SPF/DKIM records from onboarding, per-address rules, destination verification; SECURITY.md already routes private reports to GitHub first, mail second.
4. **This repo's row → `gh api` read-back.** Threat: confused or over-scoped credential. Control: read-only GETs, fail-closed, no token stored by the row (inherits the caller's `gh auth`).
5. **Site copy → visitor trust.** Threat: wrong hash/attestation instructions cause users to install tampered bytes. Control: stable URLs + SHA256SUMS + attestation verify documented together; upload-coverage statement prevents over-claiming.

### STRIDE Register (this phase's scope)

| Threat | STRIDE | Mitigation |
|--------|--------|------------|
| Zone hijack during DNS move window | Spoofing | Inventory, DNSSEC procedure, post-move resolution of every record |
| Spoofed security@ mail reaching or impersonating the owner | Spoofing | SPF/DKIM from Email Routing onboarding; SECURITY.md primary channel stays private vulnerability reporting |
| Descriptor rollback via write access to `powerbrowser-updates`/Pages/account | Tampering | Bot App scoped token for future descriptor commits; static-only row; no human edits to served files outside the train |
| `_worker.js`/`functions/` silently changing update serving | Tampering | `updates-repo-static` full-tier row + in-memory self-test |
| Wrong-target descriptor served (placeholder over-match) | Tampering / Info Disclosure | Unknown-target-must-404 live probe; `/:channel/:target/` destination preserves both dimensions |
| Cloudflare token exfiltrated from sweep or repo | Info Disclosure | One named holder per token; R2 token `release`-env-only; sweep holds none (grep-enforced); RENEWALS rows |
| Test-message contents leaking report details | Info Disclosure | Test messages are synthetic liveness mails, never real reports |
| Update-check or site traffic exceeding Free quotas | Denial of Service | Static `_redirects` (no Workers quota burn on the update path); Pages/R2 limits recorded; `/events` kept on a separate account per PITFALLS guidance |
| Stale MAR-size or signing-status copy causing bad installs | Repudiation / Info | Pending-flag while PKG-21 is open; per-OS signing status stated exactly (Windows unsigned-first-release wording owned by Phase H) |
| Elevation via fixer/workflow edits to Pages deploy workflows | Elevation of Privilege | New Pages/deploy workflows must satisfy the Phase 41 GH-12 trust-boundary rows (`workflows` + `zizmor` quick rows) [VERIFIED: scripts/verify-workflows.mjs:15-56 rule list] |

## Sources

### Primary (HIGH confidence — opened/fetched this session)

- `docs/RELEASING.md:394-429` — Pages section: two-project shape, eleven-segment rule, placeholder descriptor, single-page note (being superseded), 25 MiB MAR note
- `scripts/verify-platform.sh` CHECKS registry (`:3573-3578` shape, `:5092` `repo-controls` live-row precedent, quick/full tier split)
- `scripts/verify-repo-controls.mjs:1-120` — `gh api` read-back + fail-closed + in-memory self-test pattern reused by `updates-repo-static`
- `scripts/verify-workflows.mjs:15-56` — GH-12 trust-boundary rules new Pages/deploy workflows must satisfy
- `configuration.toml:40-50,91-94` — `display_name = "PowerBrowser"`, `license = "PolyForm Noncommercial 1.0.0"`, trademark notice, `[urls]` update/release_notes/homepage values (quoted verbatim above)
- `.planning/research/v1.6-deploy/{STACK,ARCHITECTURE,PITFALLS,SUMMARY,FEATURES}.md` — prior milestone findings (rule fits constraints, zone-security.txt resolution, 25 MiB cap, `_redirects`-vs-Functions pitfall)
- `https://developers.cloudflare.com/pages/configuration/redirects/` — `_redirects` format, placeholders, same-site 200 proxying, Functions caution
- `https://developers.cloudflare.com/pages/configuration/custom-domains/` — apex requires Cloudflare nameservers; subdomain CNAME alternative
- `https://developers.cloudflare.com/pages/platform/limits/` — 25 MiB asset cap, 100 dynamic rules, 100 projects
- `https://developers.cloudflare.com/pages/functions/advanced-mode/` — `_worker.js` takes over all routing, `/functions` ignored
- `https://developers.cloudflare.com/email-service/get-started/route-emails/` — onboarding (MX/SPF/DKIM), destination verification, routing rules, test-from-a-different-account
- `https://developers.cloudflare.com/security-center/infrastructure/security-file/` — zone security.txt fields and dashboard path
- `https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/` — nameserver change order incl. DNSSEC-off step
- `https://cli.github.com/manual/gh_attestation_verify` — `gh attestation verify` identity/bundle semantics (login-adjacent API fetch vs `--bundle` offline)

### Secondary (MEDIUM confidence)

- `.planning/drafts/distribution/S5-*` — prior single-page website shape (`index.html:328` `#download`, no `/download` route): superseded by locked WEB-05, kept as the "before" record
- `flake.nix` (no wrangler entry; `pkgs.zizmor` only) — wrangler is external-npm, not nix-provided

### Tertiary (LOW confidence — flagged `[ASSUMED]`, need owner/executor confirmation)

- `/releases/latest/download/<stable-name>` stable-URL shape (linking-to-releases doc fetch truncated this session)
- Placeholder-vs-percent-encoding matching and unknown-target 404 shape (unprobable without the live host)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — services locked by owner decision and confirmed against official docs fetched this session; versions probed on PATH.
- Architecture: MEDIUM — mechanisms resolved on paper by two independent sources (milestone research + docs fetched now); the one live probe still open by design.
- Pitfalls: HIGH — each pitfall pairs a documented cause with a concrete check or probe in the plan.

**Research date:** 2026-10-22
**Valid until:** 30 days (stable domain: DNS/Pages/Email Routing mechanics change slowly; re-verify `wrangler` pin and GitHub stable-URL shape at execution time)

**Provenance key:** `[VERIFIED: path:lines]` — opened with Read this session, values quoted verbatim beside the claim. `[CITED: url]` — fetched this session from official docs. `[ASSUMED]` — training knowledge or truncated-fetch claims; also listed in the Assumptions Log. No package names are recommended, so the package-name provenance rule is vacuous for this phase.
