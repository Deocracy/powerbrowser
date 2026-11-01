# Power Browser

## What This Is

Power Browser is the open platform (middle stream) extracted from the Sourcerer
codebase: a Firefox-ESR fork hosting Eclipse Theia IDE that is **an actual web
browser** — the user can toggle between Theia and proper browser UI, and browse
the web inside Theia — debranded and made trivially rebrandable. Firefox ESR
and Theia are the two upstreams; Power Browser is the middle stream; Sourcerer
(and anyone else's derivative) is a downstream distribution.

Two core deliverables:

1. **One file — `configuration.toml`** — plus a `brand/` assets folder, from
   which a build-time generator materializes every branding and configuration
   surface: application name, window title, icons, installer branding for
   Linux/Windows/macOS (Firefox's packaging machinery is why the fork exists —
   Power Browser installs anywhere Firefox installs), desktop files, Theia
   welcome/about branding, telemetry, declared extensions, URLs, and upstream
   pins. The same role `configuration.nix` plays for a NixOS machine.
2. **A vibe-codeable GUI**: Theia extensions are the sanctioned mechanism for
   reshaping the browser's GUI — the customize bridge (runtime CSS +
   dev-flagged JS) and URL-addressable tabs inherited from sourcerer are
   platform features, so anyone can code their own browser chrome/setup
   without forking the platform.

## Core Value

A stranger can clone Power Browser, edit `configuration.toml`, drop in a logo,
and build their own branded, working web browser without touching any other
file — then reshape its GUI through Theia extensions without forking the
platform. If a rebrand ever requires editing a second file, that is a bug.

## Context

- Source of platform code: `/home/chris/coding/sourcerer` (Deocracy/Sourcerer),
  a Zen-style fork: `upstream/` (pinned ESR tag) + `patches/` + own tree +
  Theia sidecar (`@sourcerer/*` extensions, never forking Theia core).
- The stream model was decided 2026-08-22 in sourcerer's
  `docs/PRODUCT-REQUIREMENTS.md`: Power Browser is the platform
  (`DeBIOS-Foundation/powerbrowser`, public, 501(c)(3)-owned); Sourcerer stays
  a downstream at `Deocracy/Sourcerer`. Platform names take the platform's
  name: `@powerbrowser/*`, `PowerBrowserAPI.sys.mjs`. This project executes
  that migration.
- Boundary rule inherited: downstreams add, never patch. Power Browser must
  build and ship with Sourcerer absent from the tree.
- Mozilla trademark rules make rebranding mandatory for any distributed
  Firefox fork, so the single-file rebrand is load-bearing for downstreams.
- Current state (2026-10-19, after v1.4): Gecko `FIREFOX_153_5_0esr_BUILD1`,
  Theia 1.76.0 with stock AI framework, React 19.2.8, Node 24 in the dev shell
  and the Linux package; seven `@powerbrowser/*` extensions, no AI adapter;
  `--quick` green with an empty baseline; CI green on pushed `main`. Known
  issues: 12 GUI defects in v1.4's 24-GAPS.md, custom modes keyed on
  hard-coded mode ids in `chrome-bar-widget.tsx`, and 44 UAT rows deferred to
  Chris (NG-089, phase 26).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| `configuration.toml` (TOML) as the single rebrand/config file | Human-editable by non-developers; Nix reads it natively (`builtins.fromTOML`); Node/Theia side reads it trivially | — Pending |
| Copy sourcerer tree then debrand (not fresh port) | Most of that tree is already platform code per the stream-model doc | — Pending |
| Re-fetch `upstream/` via `fetch-upstream.sh`; never copy objdirs | Multi-GB checkouts are reproducible from the pinned tag | — Pending |
| Telemetry configured in `configuration.toml` | Theia ships no telemetry destination — expose Theia's real `telemetry.telemetryLevel` enum (off/crash/error/all, default off) + downstream's own endpoint; Power Browser implements the destination | — Pending |
| Internal identifiers fixed, only user-visible surfaces configurable | `chrome://powerbrowser/`, `@powerbrowser/*`, pref branches, API names stay constant for every downstream; halves generator scope, keeps patches brand-free (exception: app basename/remoting name must vary to avoid profile collisions) | — Pending |
| Identity fields required, no silent fallback | A downstream omitting `vendor` must hard-fail, not ship under Power Browser's mark; cosmetic fields default with an echo | — Pending |
| Extensions declared in `configuration.toml` with sources | Each entry: id + source (Open VSX / npm / URL / local path) + pin | — Pending |
| Adversarial review enabled | plan_check + verifier on; /gsd-plan-review-convergence on risky phases (rename pass, generator) | — Pending |
| Autonomous nonstop default | every `/gsd-autonomous` runs without human pauses (verify→defer+continue, gaps→one retry then defer+continue, audit→accept, cleanup→approve, plan with `--no-reversibility-gates`); only a 3-retry-exhausted blocker halts `needs_human` | — Decided 2026-09-04 |
| Self-hosted MAR rung: HTTPS-only interim | updater flipped with `--enable-unverified-updates`; docs claim only TLS (no code signature verified) until a fork-signing rung lands | — Decided Phase 08 |
| NSIS-on-Nix proven, MSIX/DMG need real hosts | makensis 3.12 builds setup.exe on Linux; Windows SDK + hdiutil are host-bound, staged with operator unblocks | — Decided Phase 08 |
| Antenna collector stdlib-only, throttle on success only | failed (500) store writes must not consume throttle budget; CrashID only after durable write | — Decided Phase 09 |
| ExtensionSettings over extensions-dir | declared WebExtensions land via policy `force_installed`/`install_url`; curated set stays out of the tree | — Decided Phase 09 |
| Canonical product name from v2: **PowerBrowser** (accepted variants **Powerbrowser** / **powerbrowser** for identifier-class surfaces) | v1 shipped the spaced display form "Power Browser" across generated surfaces; the canonical form + re-pinned gates land as v2 NAME-01 so the v1 archive stays faithful to what was verified | — Decided 2026-09-04 |
| v1.2 scope: sign-off closeout + SQL store only, SQL GUI deferred | v1.2 closes formal sign-off on the 16 Open v1 requirements then ships the SQL-01 store/DB layer with no GUI surface; SQL GUI, GUI-02, and GUI-05 move to v1.3+ so the milestone stays shippable | — Decided 2026-09-05 |
| SQLite is the only store engine; single chrome-side writer behind the sole boundary | `.planning/research/duckdb-vs-sqlite/VERDICT.md` unanimous for SQLite (topology, OLTP, vendoring, format); writer is `Sqlite.sys.mjs` behind `PowerBrowserAPI.sys.mjs` into own `tabs.sqlite`, sessionstore stays restore authority, registry URIs are the join key, Theia reads readonly via `better-sqlite3` | — Decided v1.2 |
| v1.2 closeout accepted as override with doc-sync debt carried | 20/20 requirements implemented with evidence; 3 boxes unchecked + 3 summaries absent are doc-sync, not missing code; verifications 10/11/12 deferred per standing nonstop rule | — Decided 2026-09-05 |
| v1.3 scope: Theia-hosted browser GUI only (chrome bar + modes + Panorama organising) | Everything explored 2026-09-05/06: chrome bar (001-A), relocating strip modes (002-B), Panorama canvas + tree toggle, core+dependent windows, custom modes as data; bookmarks/mute/menu, DnD rearrange, cross-window tear-off seeded later; all other tree areas untouched | — Decided 2026-09-06 |
| Tabs invariant across modes; modes are data with shipped defaults | Mode switches move/filter/relocate everything except tabs; coding/browsing/organising ship as defaults, users may save layouts as modes; organising copies Panorama (freeform canvas first, tree second, SQL groups table, never sessionstore-coupled) | — Decided 2026-09-06 |
| v1.4 order: non-GUI work first, then GUI one step at a time | Upstream moves and static gaps are cheap to prove before live GUI work (Chris, 2026-10-15) | ✓ Good — phases 17–23 and 25 closed in order; only the live UAT phase stalled |
| Remove OpenCode entirely; leave Theia's AI framework stock (RM-01/02) | DSH is a separate project; Chris: "Theia AI should remain as stock, and we will work with it later" | ✓ Good — generator at 53 targets, 12 `@theia/ai-*` packages composed unmodified |
| Record the 153.1 full-run FAIL set before re-pinning to 153.5 | Every red after the move must be owned by a pre-existing label | ✓ Good — 153.5 reds were all in the 153.1 set; 17 version-sensitive rows PASS |
| Node 24, React 19, Theia 1.76 as three separate commits | A regression is attributable to one substrate move | ✓ Good — each commit left only the 4 baseline gui08 reds |
| Replace the Theia ledger row (NG-082 dropped, NG-086 added) | Chris, 2026-10-17: "Drop it, add a new row" | ✓ Good — NG-086 done, check hashes re-locked by Chris |
| Move the packaged Node runtime to v24.19.0 in v1.4 | Chris chose the move now over deferral; Theia 1.76 requires Node 24 | ✓ Good — `node-major-agreement` row keeps packaged, flake and engines majors equal |
| Telemetry text registered in `initSchema`; Welcome held off by `workbench.startupEditor: "none"` | Wins in any module order without patching Theia core | ✓ Good — first-boot check passes on fresh and carried config dirs |
| gui08 checks derive from 15-UI-SPEC through `scripts/lib/ui-spec.mjs` | Hand-kept expectation lists can only agree with the tree they were copied from | ✓ Good — R33 quick baseline is 0 bytes |
| Undo Close Group (15 s window on GroupModel) replaces the close confirmation; the last group cannot be closed | One-step close with recovery; never leaves zero groups | — Pending — statically verified, live rows deferred under NG-089 |
| Name cap 60 enforced while typing (stock `createInputBox`); side panels switch instantly (G-32 option a) | Chris's choices; spec changed to match code for G-32 | ✓ Good |
| Sketch 005 adopted into v1.5 Coding Workbench Layout, all four changes | Chris, 2026-10-17 | ⚠️ Revisit — items 3-4 built as quick tasks 2026-10-20; items 1-2 deferred when v1.5 became the chrome bar |
| v1.5 is the chrome bar only: Firefox parity, including extensions and page prompts | Chris, 2026-10-20, from the 9-agent gap list | — Pending — v1.5 |
| Address bar gets a modes dropdown; the Theia command centre is one mode and the Coding default | Chris, 2026-10-20 | — Pending — v1.5 |
| Lift "no new addressability scheme" for search, and allow chrome-bar Places writes | Needed for search fallback, bookmarks and history removal (Chris, 2026-10-20) | — Pending — v1.5 |
| Extensions see web tabs via patch 050 (tracker gate) + a chrome-side tab host, new Phase 31.1; no GUI-05; amends D-74 (one logic patch) and reverses the getTabForBrowser-null / no-synthesised-tab rule | Chris, 2026-10-21, from Phase 28 spikes 001/002a-c | — Pending — v1.5 |
| While the IDE has focus, the last web tab stays the extensions' active tab | Chris, 2026-10-21 (safe until null-tab guards are proven) | — Pending — v1.5 |
| Browsing default address-bar mode = Address and search; Organising default = Tabs (Coding = Command centre) | Chris, 2026-10-21, chosen from 30-MOCKUPS.html | — Built (Phase 30) — v1.5 |
| Extension sidebars (sidebarAction) show as a Theia side-panel view | Chris, 2026-10-22 (patch 050 turns sidebarAction off for the shell window) | — Pending (Phase 38) — v1.5 |
| Extension pages that open in a tab (options, welcome, dashboards) open in the stock window; web tabs never load moz-extension:// | Chris, 2026-10-22 (keeps the Phase 28 sub-ruling) | — Pending (Phase 38) — v1.5 |
| Extension keyboard shortcuts (commands API) included; they fire while a web page has focus, Theia keeps its keys otherwise | Chris, 2026-10-22 (matches the 2026-10-20 page-focus key ruling) | — Pending (Phase 38) — v1.5 |
| Permission prompts answer only through Firefox's own prompt buttons and Remember checkbox; notification bars keep Theia buttons; blocked pop-ups get per-pop-up Allow only | Chris, 2026-10-25 (keeps Firefox's click-delay protection; settles the ROADMAP "never an allow kind a frame could call" note) | — Pending (Phase 37) — v1.5 |
| v1.5 phases 31–38 run as "DSH codes, Claude checks": DSH plans and writes code sandboxed; Claude runs builds, live checks, reviews and verification | Chris, 2026-10-22 (DSH via OmniRoute → opencode-go/muse-spark-1.3-contributor) | — In use — v1.5 |
| Scripted headless passes count as evidence, never as UAT results | Only Chris records a sheet result; each scripted defect re-checked by a second agent | ✓ Good — 11 defects found that static gates missed |
| v1.4 closed as override with UAT-01 deferred (NG-089 → phase 26) | Chris: "I want to do the GUI checks when everthing is done on my own time" | ⚠️ Revisit — audit `gaps_found`; MODE-01 live half failed (A18) |
| Update channel `default`; MAR channel id `<app_basename>-default` (`powerbrowser-default`); one exported generator constant (UPD-11, Phase 40) | The built tree, NG-065 and the 08-04 hop drill use it; `release` would need a tier-3 rebuild and re-proof and buys nothing | Adopted 2026-10-20 |
| Release scope is en-US only (PKG-09, Phase 40) | The branding, copy and verification cover one locale; language-pack updates are off (`app.update.langpack.enabled=false`, UPD-25); the /download page (Phase 47) and release notes (Phases 49 and 50) repeat the statement when those surfaces exist | Adopted 2026-10-20 |

## configuration.toml planned sections

[product] display name, vendor, version scheme, description, homepage ·
[identity] app basename, binary name (validated `^[a-z][a-z0-9-]{1,31}$`),
installer name, remoting name — REQUIRED, hard-fail if unset ·
[assets] logo SVG/PNG, icon source (generator derives the 5 Linux PNG sizes),
wordmark · [telemetry] level enum (off/crash/error/all, default off) + endpoint
(flows into generated endpoint allowlist) · [extensions] declared list with
sources (Open VSX/npm/URL/path) and pins · [urls] support, release notes,
update check, crash report, default homepage, default search ·
[legal] license, copyright holder, trademark notice — REQUIRED ·
[theia] welcome/about text, logo, default theme · [upstreams] Firefox ESR tag,
Theia release pin · [build] channel, release/debug defaults.

Identity and legal keys are required (hard build failure if unset — a
downstream must never silently ship under Power Browser's mark). Cosmetic keys
fall back to Power Browser defaults with a visible echo at generate time.
Internal identifiers (`chrome://powerbrowser/`, `@powerbrowser/*`, pref
branches, `PowerBrowserAPI`) are fixed and never configurable.

## Requirements

### Validated

- [x] `configuration.toml` + `brand/` assets folder exist at repo root and are
      the only files touched for a rebrand — Validated in Phase 2: Configuration
      Manifest and Generator Core (CFG-01..04, GEN-04; generator reproduces the five
      Phase 1 hand-written build surfaces byte-for-byte, gated by
      `generated-byte-identity` in `scripts/verify-platform.sh --quick`) — v1.0
- [x] Internal identifiers fixed everywhere (`powerbrowser/` tree,
      `@powerbrowser/*`, `PowerBrowserAPI.sys.mjs`, `chrome://powerbrowser/`)
      — MIG-03 — v1.0
- [x] Renamed tree builds and boots on Linux with six branding surfaces green
      on the built artifact — MIG-04 — v1.0
- [x] Hook-only patch stack preserving the 3-way-merge hash chain — MIG-05 — v1.0
- [x] Upstream pins declared once in `configuration.toml` and consumed by
      fetch/build scripts; ESR/Theia uptake tooling with red-capable drift
      classes — CFG-06, UPD-01/02 (live drills staged) — v1.0
- [x] Runtime verification by exact equality from manifest expectations
      (VER-02) and adversarial fixture configs proving no single-config
      keying (VER-03) — v1.0
- [x] External-config builds (`PB_CONFIG_DIR`) with Sourcerer reproduced as a
      pure downstream from an untouched tree — CFG-05, DOC-02 — v1.0
- [x] Theia backend credential-gated and fail-closed via `token-gate` — SEC-01 — v1.0
- [x] Trademark human ritual signed (Chris, 2026-09-04, CONFIRMED) with the
      mechanical gate green — v1.0
- [x] Canonical display form **PowerBrowser** applied across all generated
      surfaces with gates re-pinned and propagation proof re-run live —
      NAME-01 — Phase 08
- [x] Real installer builds: NSIS proven on Nix, updater flipped to
      self-hosted MAR with a real Linux N→N+1 hop, `docs/BUILD.md`
      procedure written, WR-04/WR-07 pre-fixes landed — PKG-01/02/03
      (Windows MSIX + macOS DMG cells staged-unexecuted with recorded
      provisioning errors + operator unblocks in 08-05) — Phase 08
- [x] Release `objdir-release` build + release-variant rows green; live ESR
      rebase drill passed — BLD-01, UPD-03 — Phase 08
- [x] WINDOWS #13 (`registerWindowActor` boundary hole) and #14 (BiDi
      double-window) closed with green gates — SEC-02, SHELL-01 — Phase 08
- [x] npm + local-path extension sources (exact pins, integrity digests,
      fail-loud) reusing the EXT-01 chain — EXT-02 — Phase 09
- [x] WebExtensions declaration via `ExtensionSettings` in
      `distribution/policies.json` (mechanism only, no bundled set) —
      EXT-03 — Phase 09
- [x] Minimal Antenna-protocol crash collector with ping/report split and
      PII/retention/throttle policy; native reporter stays compiled out —
      TEL-04 — Phase 09
- [x] Tier-3 per-fixture builds over the new source kinds; Theia re-pin
      proof with token-gate intact — BLD-02, UPD-04 — Phase 09

### Validated (v1.3 — shipped 2026-09-06, verifications deferred)

- [x] Chrome bar (Variant A top bar) as a toolbar-like
      `@powerbrowser/*` contribution — shipped Phase 13
- [x] Modes as customizable data with shipped defaults; strip stays
      top per RED-verdict Variant-A fallback; sliding panels; tabs
      invariant — shipped Phase 14
- [x] Panorama organising canvas + tree toggle over SQL groups;
      single-writer actor channel; snapshot thumbnails with text
      fallback — shipped Phase 15
- [x] Window model: core + dependents, named setups, core-close-full-kill
      — shipped Phase 14

### Validated (v1.4 — shipped 2026-10-19, override closeout, live GUI checks deferred)

- ✓ OpenCode removed from the tree (extension, `[ai]` key, emitter, scripts,
      registry rows, docs); AI-01..05 removed; generator at 53 targets — RM-01 — v1.4
- ✓ Theia's AI framework runs stock: both D-22 overrides removed, the 12
      `@theia/ai-*` packages composed unmodified — RM-02 — v1.4
- ✓ Gecko on `FIREFOX_153_5_0esr_BUILD1`; four patches replay byte-unchanged;
      dev and release builds at 153.5; full run reds all owned — UPD-05, UPD-06 — v1.4
- ✓ Dev shell on Node 24 (`flake.lock` untouched), React 19.2.8 with one
      installed copy of each React/inversify package, every `@theia/*` on 1.76.0,
      first-boot surface checked live on fresh and carried config dirs; packaged
      Node runtime moved to v24.19.0 — UPD-07..10 — v1.4
- ✓ Non-GUI gaps closed: fresh-clone Theia build row (G-14.1.1-9), `group-channel`
      row with 12-plant self-test (G-14.1.1-10), schema v3/v4 ledger rows NG-087/088,
      generator concurrency fix (inkscape), `planning-paths` row — PLAT-01..05 — v1.4
- ✓ 15-UI-SPEC re-pinned to the shipped Panorama; both gui08 checks derive from
      it; stale tray code removed; `quick-baseline.txt` empty — PAN-01, PAN-07 — v1.4
- ✓ Panorama decisions 1 (ungrouped tabs as loose cards) and 2 (strip filter
      scope) made by Chris and recorded — PAN-02 — v1.4
- ✓ Variant B records current; 60-character mode/setup name cap applied while
      typing (G-23); side panels switch instantly (G-32); 14-VERIFICATION written —
      MODE-01 (records half), MODE-02..04 — v1.4
- ✓ Sketch 005 verdict recorded: adopted into v1.5 Coding Workbench Layout,
      all four changes (Chris, 2026-10-17) — SK-01 — v1.4
- ✓ CI green on pushed `main` (run 39340825244); NG-074 done — CI-01 — v1.4

### Active

**Carried from v1.4 (unmet, deferred by Chris to phase 26):**

- [ ] UAT-01: the 10, 13, 14, 14.1, 14.1.1 and 15 UAT sheets have no pending
      result, including a React 19 runtime line. Chris ran A01–A20 live; 44 rows
      remain. NG-089 deferred-approved to phase 26 (Chris: "I want to do the GUI
      checks when everthing is done on my own time"). Checklist:
      `.planning/milestones/v1.4-phases/24-live-uat-pass/24-CHRIS-CHECKLIST.md`
- [ ] MODE-01 live half: Chris confirms the strip relocation live (G-11). A18
      failed on its Organising step (14/3 and 14.1.1/11 read issue); G-11 not earned
- [ ] PAN-03..06 live checks: strip filter by active group, Undo Close Group,
      card close, last group kept. Implemented and statically verified (14/14);
      the live rows are 15-UAT pending rows under NG-089

**v1.5 Chrome Bar Firefox Parity** (scope: `.planning/research/chrome-bar-firefox-gap.md`):

- [ ] Address bar modes dropdown: search engines, Bookmarks, Tabs, History,
      Actions, and a Theia command-centre mode (files, `>` commands, `@`
      symbols) that is the default in Coding
- [ ] Address bar and search: search fallback, localhost/host:port fixup,
      real switch-to-tab, engine suggestions, inline autofill, engine picker,
      one-off engines, paste & go, Alt+Enter, Shift+Del row removal
- [ ] Navigation buttons and keys: Stop, hard reload, back/forward history
      menu, Home; Ctrl+T/W/R, Alt+Left/Right, F6, Alt+1-9, working with the
      page focused
- [ ] Site identity and app menu: real security state with "Not Secure",
      site information and permissions panel, clear cookies, tracking shield;
      hamburger menu with Settings, Passwords, Add-ons
- [ ] Page tools and bookmarks: find in page, zoom, print, favicons, mute,
      downloads, fullscreen; bookmark star, reopen closed tab, bookmarks
      toolbar, clear history
- [ ] Extensions: WebExtension toolbar buttons and the extensions (puzzle) menu
- [ ] Page prompts: permission requests, alert/confirm/auth dialogs, page
      context menu, window.open/target=_blank as web tabs, password and form
      autofill

**Deferred from the earlier v1.5 plan (Chris, 2026-10-20: "we want to work on
the chrome bar for this milestone, that's it"):** sketch 005 items 1-2 (one
title row, centred address box; items 3-4 were built as quick tasks
2026-10-20), the 12 defects in `.planning/milestones/v1.4-phases/24-live-uat-pass/24-GAPS.md`,
custom modes driven by mode data, and the NG-089 live checks above.

### Validated (v1.2 — shipped 2026-09-05, override closeout, verifications deferred)

- [x] Formal sign-off closeout on the carried v1 requirements — migration/inventory (MIG-01, MIG-02), GUI survivals (GUI-01, GUI-03, GUI-04), generator surfaces (GEN-01, GEN-02, GEN-03, GEN-05), telemetry/extension live drills (TEL-01..03, EXT-01), fleet proof (VER-01), rebranding doc (DOC-01) — 15/15 implemented with evidence (5 human UAT sheets staged, verifier deferred) — Phase 10
- [x] SQL store design reviewed before code — authority/invariant table + recorded sign-off (SQL-02); schema + migration plan exercised against fixture DBs with recorded sign-off (SQL-03 implemented, box unchecked — doc-sync debt) — Phase 11
- [x] SQL store build with no GUI surface — chrome-side writer behind the sole boundary in its own `tabs.sqlite` (SQL-01 implemented, box unchecked — doc-sync debt); readonly query API + Places/sessionstore reads + emitter-exercising absence instrument (SQL-04 implemented, box unchecked — doc-sync debt); store gates green — second-writer scan, integrity soak, URI→row→restart→reopen roundtrip, registry-shape untouched, live ESR rebase drill (SQL-05) — Phase 12

### Out of Scope

- Drag-anywhere GUI rearrange, cross-window tab tear-off — seeded for
      later milestones (gui-component-dnd, firefox-parity-tabs). The
      bookmarks strip, per-tab mute and browser menu moved into v1.5
- DSH (DeepSeek Harness) and any AI assistant integration — DSH is a
      separate project (Chris, 2026-10-16); OpenCode was removed from the tree in v1.4
- Customising Theia's AI framework — stays stock until a later milestone
      takes it up (RM-02, Chris 2026-10-16)
- Release and distribution (MSIX, DMG, update host, release pipeline) —
      held in backlog 999.2 until a milestone scopes a first public release
- Unified tab strip where web pages and editors are peers (GUI-05) — the
      mirror/proxy bridge stays a later milestone, as in the upstream plan;
      current browser access is the toggle + in-Theia web tabs (GUI-02, Phase 14.1)
- Databasise and the curated addon set — composed in downstream, never in the
  platform tree
- Moving every conceivable setting into `configuration.toml` in milestone 1 —
  the file grows toward "everything configurable" incrementally

## Current State (v1.4 shipped 2026-10-19)

v1.4 Platform Updates and GUI Close-out is archived as an override closeout
chosen by Chris:
`.planning/milestones/v1.4-ROADMAP.md`,
`.planning/milestones/v1.4-REQUIREMENTS.md`,
`.planning/milestones/v1.4-MILESTONE-AUDIT.md` (status `gaps_found`),
phases under `.planning/milestones/v1.4-phases/`. Phases 17–25 (42 of 43
plans executed; 24-05, the GEN-05 drill, not run; 261 commits,
2026-10-16 → 2026-10-19) delivered: OpenCode removed; Gecko 153.5.0esr;
Node 24 / React 19.2.8 / Theia 1.76.0; non-GUI gaps closed; Panorama spec
re-pinned with an empty quick baseline; the Panorama worklist (strip filter
by active group, Undo Close Group, card close, last group kept); modes
leftovers (name cap 60, instant panels); sketch 005 adopted for v1.5; CI
green on pushed `main`. Not achieved: UAT-01 (A18 failed its Organising
half, the rest deferred to phase 26 under NG-089), the live half of
MODE-01, and the live checks of PAN-03..06. Twelve defects are listed for
v1.5 in 24-GAPS.md; eleven came from scripted headless passes and were
confirmed on an independent re-check.

<details>
<summary>Previous state (v1.3 shipped 2026-09-06)</summary>

v1.3 Browser GUI is archived:
`.planning/milestones/v1.3-ROADMAP.md`,
`.planning/milestones/v1.3-REQUIREMENTS.md`,
`.planning/milestones/v1.3-MILESTONE-AUDIT.md` (status `tech_debt`,
accepted per standing nonstop instruction), tag `v1.3`. Phases 13–15
(9/9 plans + 1 revision) delivered: top chrome bar with navigation +
suggestions + gates; modes as data with sliding panels and invariant
tabs; dependent windows with named setups; Panorama canvas + tree over
SQL groups with snapshot thumbnails. Spike verdict RED → Variant-A
fallback recorded (strip stays top). No GUI-02/GUI-05 bridge work this
cycle. Carried forward: `/gsd-verify-work 13/14/15`, GUI-07/GUI-08 box
flips, piles + search, v1.4 candidates below.

</details>

<details>
<summary>Previous state (v1.2 shipped 2026-09-05)</summary>

v1.2 Sign-off Closeout and SQL Store is archived:
`.planning/milestones/v1.2-ROADMAP.md`,
`.planning/milestones/v1.2-REQUIREMENTS.md`,
`.planning/milestones/v1.2-MILESTONE-AUDIT.md` (status `tech_debt`,
accepted per standing nonstop instruction), tag `v1.2`. Phases 10–12
(9/9 plans executed per git, 6/9 summaries present, 22 tasks) delivered:
15-box sign-off assembly with 16-vs-15 reconciliation and five staged
human UAT sheets; SQL authority + schema + migration plan with fixture
exercise and recorded sign-offs; chrome-side writer, readonly query API
with Places/sessionstore reads, and nine green store gates with a live
ESR rebase drill. No GUI surface this cycle. Carried forward:
`/gsd-verify-work 10/11/12`, the three doc-sync box flips
(SQL-01/SQL-03/SQL-04), and the three missing plan summaries
(11-02, 11-03, 12-01).

</details>

<details>
<summary>Previous state (v1.1 shipped 2026-09-05)</summary>

v1.1 Hardening is archived:
`.planning/milestones/v1.1-ROADMAP.md`,
`.planning/milestones/v1.1-REQUIREMENTS.md`,
`.planning/milestones/v1.1-MILESTONE-AUDIT.md`, tag `v1.1`. Phases 08–09
(9/9 plans) executed: NAME-01 canonical **PowerBrowser**, PKG-01/02/03
real installers + self-hosted MAR + `docs/BUILD.md`, BLD-01/02 release +
per-fixture builds, UPD-03/04 live rebase + re-pin proofs, SEC-02/SHELL-01
WINDOWS #13/#14 closures, EXT-02/03 npm/local-path + WebExtensions policy,
TEL-04 crash collector. Carried to v1.2: formal sign-off on the 16 Open v1
requirements still staged (human/tier-3 halves).

</details>

## Current Milestone: v1.5 Chrome Bar Firefox Parity

**Goal:** The chrome bar does what Firefox's toolbar does, measured against
the 2026-10-20 gap list (`.planning/research/chrome-bar-firefox-gap.md`).

**Target features:**
- Address bar modes dropdown (engines, Bookmarks, Tabs, History, Actions,
  Theia command centre as the Coding default)
- Address bar and search (search fallback, fixup, switch-to-tab,
  suggestions, autofill, engines)
- Navigation buttons and keyboard shortcuts that work with the page focused
- Site identity, permissions and the app menu
- Page tools and bookmarks
- WebExtension toolbar buttons and menu
- Page prompts (permissions, dialogs, context menu, new-window links as tabs,
  autofill)

**Rule changes for this milestone:** typed non-URL text may search (lifts
13-UI-SPEC's "no new addressability scheme"); the chrome bar may write to
Places (lifts the read-only Places row in `powerbrowser/INTERNAL-APIS.md`).
Firefox internals still go only through PowerBrowserAPI, and Theia core is
still never patched.

**Not in this milestone:** sketch 005 items 1-2, the 24-GAPS defects,
data-driven custom modes, NG-089 live checks, private browsing, containers,
Sync.

## Retired Milestone Section (v1.4 active scope, superseded by Current State above)

**Goal (was):** Remove OpenCode, move Firefox and Theia to current upstream, close the
remaining non-GUI gaps, then finish the v1.3 GUI leftovers one step at a time
until the commit gate and CI are green.

**Target features:**
- OpenCode removal (AI-01..05 removed; DSH is a separate project)
- Firefox 153.5.0esr `BUILD1` with a full build
- Theia 1.76.0 with React 19, dev shell on Node 24
- Remaining non-GUI gaps closed
- GUI, one step at a time: Panorama spec and checks, Phase 14 / 14.1.1
  leftovers, one live UAT pass, sketch 005 decision, CI green

## Retired Milestone Section (v1.3 active scope, superseded by Current State above)

**Goal (was):** Theia becomes a working browser shell — chrome bar, mode-driven tabs, Panorama organising — on the v1.2 SQL store.

**Target features:**
- Chrome bar (Variant A top bar): back/forward/reload, address input, new tab, mode toggle
- Modes (coding/browsing/organising) as data with defaults; strip stays top per RED verdict; sliding panels; tabs invariant
- Panorama organising canvas + tree toggle; SQL groups table; snapshot thumbnails
- Core + dependent windows; named setups; core-close-full-kill
- Strip-relocation spike first, Variant-A fallback baked in

## Retired Milestone Section (v1.2 active scope, superseded by Current State above)

**Goal (was):** Close formal sign-off on the v1 carry-overs and ship the SQL-01
tab-store/DB layer with no GUI surface.

**Target features:**
- Sign-off closeout: MIG-01/02, GUI-01/03/04 survivals, GEN-01/02/03/05,
  TEL-01..03 + EXT-01 live drills, VER-01 fleet proof, DOC-01 stranger
  carry-test — every box checked with live evidence.
- SQL-01 store: tabs as SQL rows on `TabUriRegistry` identity
  (bookmarks/sessions exposure alongside); single chrome-side writer behind
  `PowerBrowserAPI` in its own SQLite file; sessionstore stays authoritative
  for restore; registry URIs are the join key. Boundary per ARCHITECTURE.md
  Anti-Pattern 6: extension point, not a `[features]` flag.

No GUI work this cycle: SQL GUI surface, GUI-02, and GUI-05 stay deferred
to v1.3+ (confirmed 2026-09-05 — v1.2 is closeout + store-only).

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-20 after starting v1.5 Chrome Bar Firefox Parity*
