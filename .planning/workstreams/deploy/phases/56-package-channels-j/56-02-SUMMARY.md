---
phase: 56-package-channels-j
plan: 02
subsystem: packaging
status: complete
tags: [nix, binary-cache, cachix, r2, flathub, flatpak, INF-05, PKG-20]

requires:
  - phase: 56-package-channels-j
    provides: plan 56-01 flake package, the Flatpak tokens and the shared release-contract derivation
provides:
  - nix/cache.json, one binary-cache interface behind a Cachix backend and an R2 fallback backend
  - the binary-cache row and its self-test, with the shared-derivation tripwire
  - the finished Flathub manifest verification half (TXT record, pending exception marker, one repack module)
  - the flathub-manifest row and its self-test, with the shared-substituter tripwire
  - docs/download-flatpak.md, the paste-ready Flatpak /download copy
  - docs/cache-flathub-checkpoint.md, the owner checkpoint text and the render command
  - scripts/verify-flathub-manifest.mjs --render, which writes rendered release tokens outside the tree
  - one RENEWALS row for the binary-cache token
affects: [56-03, 56-04, 56-05]

actuals:
  tokens: 12440      # chars/4 over the plan's realized diff (git diff e695d7c8..HEAD, 49763 bytes)
  tasks: 3
  commits: 3        # MEASURED: git rev-list --count e695d7c8..HEAD
plan_head_before: e695d7c8259d1d213157f83197a94dd65962506a
plan_head_after: 5771cd7f1781add808fd02f34db7c25c4239d8ba

key-files:
  created:
    - nix/cache.json
    - scripts/verify-binary-cache.mjs
    - scripts/verify-flathub-manifest.mjs
    - docs/download-flatpak.md
    - docs/cache-flathub-checkpoint.md
  modified:
    - flatpak/org.debios.PowerBrowser.json
    - docs/RENEWALS.md
    - scripts/verify-platform.sh

key-decisions:
  - "The cache interface is derived: its substituters and trusted keys must equal the two backend blocks in order. A second literal that drifts is red."
  - "Cache public keys and the R2 host are placeholders (@CACHIX_PUBLIC_KEY@, @R2_PUBLIC_KEY@, @R2_PUBLIC_HOST@, @R2_ACCOUNT_ID@). The owner creates those values; --release refuses them. No real key is invented."
  - "flake.nix is not changed to add nixConfig. A placeholder trusted key in nixConfig would make every consumer's nix reject the config, so the substituter wiring waits for the live keys (BLOCKED.md item 2)."
  - "The RENEWALS row is appended with the five-column shape. It sits beside the existing Cachix token row (Phase 42) and does not replace it, because the R2 fallback token is a separate credential."
  - "The Flathub exception stays pending-owner-reply on the written-exception path. The manifest carries one repack module and no from-source module, so neither path is built half-way."
  - "The Flatpak TXT record name derives from the homepage host (_flathub.powerbrowser.org). The token stays a placeholder until the owner sets it from the verification step."
  - "The Flathub submission manifest renders from tokens. --render writes it to a path outside the tree and refuses the placeholder hash, so no unhashed copy can leave the repository."
  - "The checkpoint doc keeps every live verb (send, push, submit) under one owner-steps heading, as the plan requires. The doc names the owner by @RELEASE_REPO@ rather than the owner slug, for the same brand-scan reason as plan 56-01."

patterns-established:
  - "Shared-derivation tripwires: each channel row cross-checks one value it shares with another channel (the template in binary-cache, the substituter in flathub-manifest), and the self-test plants a drift in each."
  - "Owner steps are tracked text. The checkpoint doc names every live action and the reply field the owner fills, and nothing in the tree performs it."

requirements-completed: [INF-05, PKG-20]

coverage:
  - id: D1
    description: "binary cache serves the flake package with Cachix first and R2 as fallback behind one interface; the substituters and trusted keys derive from the backend blocks"
    requirement: "INF-05"
    verification:
      - kind: automated
        ref: "scripts/verify-platform.sh --only binary-cache (PASS); binary-cache-self-test (7 red, 1 green)"
        status: pass
  - id: D2
    description: "cache token has a RENEWALS row, asserted by structure"
    requirement: "INF-05"
    verification:
      - kind: automated
        ref: "binary-cache row (structure check) and renewals row (PASS)"
        status: pass
  - id: D3
    description: "Flathub manifest is submission-shaped: BaseApp runtime, persist, Flatpak-only disable key, x-checker-data, TXT record derived, exception pending on one path"
    requirement: "PKG-20"
    verification:
      - kind: automated
        ref: "scripts/verify-platform.sh --only flathub-manifest (PASS); flathub-manifest-self-test (11 red, 1 green)"
        status: pass
  - id: D4
    description: "Flatpak /download copy names PowerBrowser, carries an install line with no version literal and no internal identifier"
    requirement: "PKG-20"
    verification:
      - kind: automated
        ref: "flathub-manifest row, download copy section; self-test plant 'download copy carries an internal identifier' red"
        status: pass
---

# Phase 56 Plan 02: Binary cache and Flathub static half Summary

**One cache interface over Cachix and an R2 fallback, and a submission-shaped Flathub manifest with a pending exception, both proven by derive-and-compare rows. Every live step is an owner step in the checkpoint text.**

## Performance

- **Tasks:** 3 of 3
- **Commits:** 3 (a20468c3, c854f01a, 5771cd7f)
- **Quick gate:** `scripts/verify-platform.sh --quick` exit 0 after the last commit.

## Accomplishments

- `nix/cache.json` declares the Cachix backend first and the R2 bucket second. The interface lists both substituters and both public keys, derived and equal. Placeholders stand for the values the owner creates.
- `scripts/verify-binary-cache.mjs` is red on a substituter or key that disagrees with its backend, a missing or empty backend block, a missing RENEWALS cache row, a credential-shaped literal, a placeholder under `--release`, and a Flatpak template that names another release shape.
- The Flathub manifest gains `x-flathub-verification` (DNS TXT record derived from the homepage host, token placeholder) and `x-source-exception` (`pending-owner-reply` on `written-exception`).
- `scripts/verify-flathub-manifest.mjs` checks the app id, persist path, runtime, disable merge, checker data, TXT record, desktop and icon agreement (the PNG by bytes), the single repack module, the download copy, and the cache substituter. `--render` produces a copy outside the tree.
- `docs/cache-flathub-checkpoint.md` holds the Cachix licence request, the R2 fallback steps, the Flathub linter-exception request, the submission steps, and the clean-machine proof, all under the owner-steps heading.

## Green row runs

- `binary-cache`: PASS in quick mode. `binary-cache-self-test`: PASS, 7 planted drifts red, 1 control green.
- `flathub-manifest`: PASS in quick mode. `flathub-manifest-self-test`: PASS, 11 planted faults red, 1 control green.
- `renewals` and `renewals-self-test`: PASS with the new row.
- `flake-repack` and `policies-update-split`: still PASS.
- `scan-brand-residue`: PASS, with the checkpoint doc and the new scripts staged.
- `scripts/verify-platform.sh --quick`: exit 0 after the last commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The Flatpak tripwire plant matched the live template**
- **Found during:** Task 1 self-test
- **Issue:** The planted "neighbouring release" template was computed from the live template, so it did not change the manifest and the row stayed green.
- **Fix:** The plant names another host, which the row must reject.
- **Commit:** a20468c3

**2. [Rule 1 - Bug] The cache-substituter plant broke the JSON**
- **Found during:** Task 2 self-test
- **Issue:** A text replacement removed a string that also matched `cachix.substituter`, so the file failed to parse and the message said `null`.
- **Fix:** The plant edits the parsed object, and the row names an unparseable cache explicitly.
- **Commit:** c854f01a

**3. [Rule 2 - Missing critical functionality] No render path for the submission manifest**
- **Found during:** Task 3 (the checkpoint text told the owner to render tokens and no command did)
- **Fix:** `verify-flathub-manifest.mjs --render <path>` writes the rendered copy outside the tree and refuses the placeholder hash and any in-tree path. Its token substitution was checked against a fake digest in the scratchpad; a real render waits for the release hash.
- **Commit:** 5771cd7f

### Plan items not implemented

- **`flake.nix` `nixConfig`:** not added. A placeholder trusted key in `nixConfig` would make every consumer's nix reject the config. The substituter wiring waits for the live keys (BLOCKED.md item 2).
- **Live substitute proof and Flathub test build:** owner steps, not run (BLOCKED.md items 2 and 6).

## Known Stubs

| Stub | File | Why it stays |
| --- | --- | --- |
| `@CACHIX_PUBLIC_KEY@`, `@R2_PUBLIC_KEY@`, `@R2_PUBLIC_HOST@`, `@R2_ACCOUNT_ID@` | nix/cache.json | The owner creates the Cachix cache, the R2 bucket and its key pair. `verify-binary-cache.mjs --release` refuses them. |
| `@FLATHUB_VERIFICATION_TOKEN@` | flatpak/org.debios.PowerBrowser.json | Flathub shows the value at the verification step. The row refuses it under `--release`. |
| `@RELEASE_REPO@` in the Flatpak copy | docs/download-flatpak.md | Rendered by the owner at paste time, like the Nix copy. |

## Threat Flags

None beyond the plan's register. The cache config carries no credential; the row refuses credential-shaped literals.

## Unverified offline

- The Cachix free-plan eligibility for PolyForm Noncommercial. The owner's licence reply decides it (BLOCKED.md item 6).
- Whether `nix store prefetch-file` and `flatpak-builder` accept the rendered forms. The owner runs both at the checkpoint.

## Self-Check

- [x] Both backends present and the interface equals them (`verify-binary-cache.mjs`).
- [x] The RENEWALS cache row is structurally valid (`renewals` PASS).
- [x] The Flathub manifest is valid JSON and derives its values (`flathub-manifest` PASS).
- [x] No live action was performed: no cache push, no Cachix or Flathub account change, no submission.
- [x] `--quick` exit 0 after the last commit.

## Self-Check: PASSED
