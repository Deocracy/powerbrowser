---
phase: 56-package-channels-j
plan: 03
subsystem: packaging
status: complete
tags: [winget, homebrew, cask, WINGET_TOKEN, DIST-04, DIST-11]

requires:
  - phase: 56-package-channels-j
    provides: the shared release-contract derivation (scripts/lib/channel-identity.mjs) and the RENEWALS table shape
provides:
  - winget/ three-file manifest set as a template rendered per release
  - homebrew-tap/Casks/powerbrowser.rb as a template rendered per release
  - the winget-manifest and homebrew-cask rows and their self-tests, with the payload shape asserted
  - the WINGET_TOKEN custody row in docs/RENEWALS.md
  - docs/winget-tap-checkpoint.md, the owner's dry-run and submission commands
affects: [56-04, 56-05]

actuals:
  tokens: 11071     # chars/4 over the plan's realized diff (git diff 327945ce..HEAD, 44287 bytes)
  tasks: 3
  commits: 3        # MEASURED: git rev-list --count 327945ce..HEAD
plan_head_before: 327945cee599e0bea5be4208699cc41943fdd3d5
plan_head_after: 8ff6e68765315803e2e2ddbd465174a428b74e98

key-files:
  created:
    - winget/DeBIOSFoundation.PowerBrowser.yaml
    - winget/DeBIOSFoundation.PowerBrowser.installer.yaml
    - winget/DeBIOSFoundation.PowerBrowser.locale.yaml
    - homebrew-tap/Casks/powerbrowser.rb
    - scripts/verify-winget-manifest.mjs
    - scripts/verify-homebrew-cask.mjs
    - docs/winget-tap-checkpoint.md
  modified:
    - docs/RENEWALS.md
    - scripts/verify-platform.sh

key-decisions:
  - "The winget set and the cask are templates. YAML and Ruby cannot compute a value, so every per-release value is a quoted @TOKEN@ that the DIST-12 leg renders (wingetcreate update, or a render step). The row renders the same tokens and derives each expected value, so the tree never carries a hand-typed version."
  - "The Windows installer and the macOS disk image are fixtures until Phases 54 and 55 name their assets (A2, A3). The quick row cannot download, so the fixture digests are computed in the row from fixture bytes the row carries. The installer carries a '# fixture:' marker, which the row requires while docs/RELEASING.md reads the Windows asset as pending. A release under --release refuses a fixture."
  - "The publisher is a token rendered from product.vendor_display. A literal would trip verify-manifest-literals, and the row compares the rendered document, not the text."
  - "The cask's darwin deferral marker names A3 and Phase 55 on one line, and the cask makes no signing or Gatekeeper claim. The row refuses an arm64 stanza and any signing claim, and the claim words are assembled at run time so this row's source contains none of them."
  - "The WINGET_TOKEN row is appended with the five-column shape and records the Apps-only exception (wingetcreate cannot open the cross-repository pull request with an App token). The row reads the credential by name only."
  - "The winget submission uses the wingetcreate submit subcommand in the checkpoint doc. The --submit flag is absent from tracked text, as the plan's acceptance requires."

patterns-established:
  - "Fixture-with-marker: a payload that waits on an unnamed asset carries a visible marker, the row derives the fixture digest in-process, and the release refuses the fixture while the asset table is pending."

requirements-completed: [DIST-04, DIST-11]

coverage:
  - id: D1
    description: "winget set derives identifier, version, installer URL and fixture hash; locale values derive from configuration.toml"
    requirement: "DIST-04"
    verification:
      - kind: automated
        ref: "scripts/verify-platform.sh --only winget-manifest (PASS); winget-manifest-self-test (8 red, 1 green)"
        status: pass
  - id: D2
    description: "WINGET_TOKEN custody row present by structure; the credential value is never read"
    requirement: "DIST-04"
    verification:
      - kind: automated
        ref: "winget-manifest row custody section; self-test 'WINGET_TOKEN custody row removed' red"
        status: pass
  - id: D3
    description: "cask derives version, url and sha256; auto_updates true; verified host; livecheck; darwin deferral; no signing claim"
    requirement: "DIST-11"
    verification:
      - kind: automated
        ref: "scripts/verify-platform.sh --only homebrew-cask (PASS); homebrew-cask-self-test (8 red, 1 green); ruby -c Syntax OK via nix shell"
        status: pass
---

# Phase 56 Plan 03: winget manifest set and Homebrew cask Summary

**The winget set and the own-tap cask are derived payloads with quoted release tokens, row-guarded, with the Windows and macOS assets honestly marked as fixtures until Phases 54 and 55 name them.**

## Performance

- **Tasks:** 3 of 3
- **Commits:** 3 (ef291425, c72580f2, 8ff6e687)
- **Ruby syntax:** `ruby -c homebrew-tap/Casks/powerbrowser.rb` prints `Syntax OK`, run through `nix shell --inputs-from . nixpkgs#ruby` (the locked nixpkgs, read from the binary cache; nothing written).
- **Quick gate:** `scripts/verify-platform.sh --quick` exit 0 after the last commit.

## Accomplishments

- `winget/` holds the three manifests: the version file, the installer file (an x64 arch node with its URL and hash tokens and the fixture marker) and the default-locale file. The row renders the tokens and derives the identifier, version, installer URL, publisher, licence, homepage and release-notes link from the tree.
- `homebrew-tap/Casks/powerbrowser.rb` is one `cask "powerbrowser" do ... end` block with `auto_updates true`, `verified:` on the release host and owner path, a `livecheck` block with `strategy :github_latest`, and the uninstall and zap stanzas. The darwin deferral is recorded on one line that names A3 and Phase 55.
- `scripts/verify-winget-manifest.mjs` and `scripts/verify-homebrew-cask.mjs` derive and compare every value, with the wingetcreate `update --out` shape and the cask stanza shape asserted.
- `docs/winget-tap-checkpoint.md` has the dry-run commands (`wingetcreate update ... --out`, no submit flag) and the owner-steps section for the winget pull request and the tap commit.

## Green row runs

- `winget-manifest`: PASS. `winget-manifest-self-test`: PASS, 8 planted faults red naming the file or value, 1 control green.
- `homebrew-cask`: PASS. `homebrew-cask-self-test`: PASS, 8 planted faults red, 1 control green.
- `homebrew-cask --release`: red, naming the fixture disk image while docs/RELEASING.md reads the macOS asset as pending (expected).
- `renewals` and `renewals-self-test`: PASS with the WINGET_TOKEN row.
- `verify-manifest-literals`: PASS after the publisher token fix.
- `scripts/verify-platform.sh --quick`: exit 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Literal publisher tripped the manifest-literals row**
- **Found during:** the quick gate after Task 3
- **Issue:** The locale file typed `DeBIOS Foundation`, the configured vendor display name, outside the manifest-owned surfaces.
- **Fix:** The publisher is a token rendered from `product.vendor_display`, and the row compares the rendered document.
- **Commit:** 8ff6e687

**2. [Rule 1 - Bug] Two self-test expectations and one plant were wrong**
- **Found during:** Task 1 and Task 2 self-tests
- **Issue:** The installer plant removed a line and left the YAML invalid, so the parse error was reported instead of the missing key; the cask header plant expected a phrase the message does not carry; a cask claim-word literal sat in the row source.
- **Fix:** Corrected the plant text, the expected phrase, and the claim words (assembled at run time).
- **Commit:** ef291425

### Plan items implemented differently

- **`ruby -c`:** the plan's verify runs `ruby -c` directly, and ruby is not installed on this host. It runs through `nix shell --inputs-from . nixpkgs#ruby`, which prints `Syntax OK`. BLOCKED.md item 5 is closed with this command.
- **Shape-check placement:** the wingetcreate and stanza shape assertions live in the two rows' main check, not in a separate self-test-only step. The plants that prove them are in each row's self-test.
- **No `brew audit`:** the owner runs `brew audit --new --cask` once the tap exists (BLOCKED item 10).

## Known Stubs

| Stub | File | Why it stays |
| --- | --- | --- |
| `# fixture:` installer, `@WINDOWS_INSTALLER_ASSET@`, `@WINDOWS_INSTALLER_SHA256@` | winget/DeBIOSFoundation.PowerBrowser.installer.yaml | Phase 54 names the Windows asset (A2). The row refuses the fixture under `--release`. |
| `@MACOS_DMG_ASSET@`, `@MACOS_DMG_SHA256@` | homebrew-tap/Casks/powerbrowser.rb | Phase 55 names the macOS disk image (A3). The row refuses the fixture under `--release`. |
| `@RELEASE_*@` tokens | winget/*.yaml, the cask | Rendered per release by the DIST-12 leg (plan 56-04). |

## Threat Flags

None. The row reads the custody row by name and holds no credential. The rendered manifests carry no credential-shaped value (the row refuses one).

## Unverified offline

- The winget `InstallerType: nullsoft` and the `/S` silent switch against the Phase 54 installer. The owner runs `wingetcreate` dry-run and a Windows install at Phase 54 (BLOCKED item 11).
- The cask `depends_on macos: ">= :big_sur"` minimum, the `uninstall delete:` path and the `zap trash:` path. The owner confirms them in Phase 55 (BLOCKED item 12).
- The bundle identifier of the macOS app is not in the cask; `uninstall` uses the application path, which the owner confirms in Phase 55.

## Self-Check

- [x] Winget set renders the derived identifier, version and URL (`winget-manifest` PASS).
- [x] Cask renders the derived version, url and sha256 with auto_updates, verified, livecheck and the deferral (`homebrew-cask` PASS).
- [x] `ruby -c` passes on the cask.
- [x] No credential value in the tree (`ghp_` and `github_pat_` grep 0; the row refuses the shapes).
- [x] No live action: no winget pull request, no tap push, no submission, no notarization claim.
- [x] `--quick` exit 0 after the last commit.

## Self-Check: PASSED
