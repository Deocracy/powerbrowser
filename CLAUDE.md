# Power Browser — project instructions

Power Browser is a **rebrandable browser platform**: a Gecko shell (patch-set repo, never a
Firefox fork) hosting an Eclipse Theia sidecar as its default GUI. Phase 1 extracted the
platform from its originating product and renamed it under fixed identifiers; Phase 2 makes
`configuration.toml` + `brand/` the only rebrand inputs, proven byte-identical to what Phase 1
wrote by hand.

Read `.planning/PROJECT.md` for the product, `.planning/ROADMAP.md` for where the work is, and
`.planning/REQUIREMENTS.md` for what is in and out of scope. This file is the set of rules that
hold regardless of which phase you are in.

- **Sketch findings for Power Browser** (design decisions, CSS patterns, visual direction) → `Skill("sketch-findings-Power-Browser")`
- **Spike findings for Power Browser** (implementation patterns, constraints, gotchas) → `Skill("spike-findings-Power-Browser")`

---

## Hard rules

These are inherited constraints, not preferences. Four of them are also binding through
`REQUIREMENTS.md`'s *Out of Scope* section. In one line each: never fork or patch Theia core;
never modify Gecko outside the patch stack; design for the bridge; keep the repo at a path with
no space; and Theia is the default GUI while stock browser chrome stays reachable.

### 1. Never fork or patch Theia core

Theia-side additions are `@powerbrowser/*` extensions composed into the sidecar. Upstream Theia
is adopted by **re-pinning a version**, never by editing it. Consume `@theia/*` as npm
dependencies; never vendor the framework monorepo into this tree.

`scripts/diff-theia-core.sh` is the check. If a change seems to require editing Theia core,
that is the signal to reshape the change, not to edit core.

### 2. Never modify Gecko outside the patch stack

This is a Zen-style patch-set repo: an `upstream/` checkout at a pinned ESR tag,
plus `patches/`, plus this tree. `upstream/` is fetched by `scripts/fetch-upstream.sh` and is
never hand-edited — `git -C upstream diff` staying empty is the invariant.

Firefox internals are reached through **one** anti-corruption layer,
`powerbrowser/shell/PowerBrowserAPI.sys.mjs`, with every touchpoint catalogued in
`powerbrowser/INTERNAL-APIS.md`. `scripts/check-internals-boundary.sh` enforces both halves; it
has a `--self-test` and a `--catalogue` mode. A second file importing a Firefox internal
directly is the failure this rule exists to prevent — `TheiaService.sys.mjs` is a *consumer* of
the boundary, not a second one.

### 3. Design for the bridge

Nothing may weld Theia to full-window presentation. The mirror/proxy bridge — a chrome-owned tab
model, `@powerbrowser/browser-bridge` — must stay landable without rework, which is why
`TabUriRegistry`'s exported shape is asserted (`scripts/verify-registry-shape.mjs`). This is
GUI-04, and it is the reason the unified tab strip is a later milestone rather than a rewrite.

### 4. The repo must live at a path containing no space character

`pkgs.mkShell` appends an rpath to the **space-separated** `NIX_LDFLAGS`. A space in the path
makes the cc-wrapper split on it, and every native link step fails — in the Gecko compile and in
Theia's node-gyp modules alike. `/home/chris/coding/Power-Browser` is compliant. Do not move the
checkout under a directory such as `~/My Projects`.

### 5. Theia is the *default* GUI; stock browser chrome is reachable

**This rule differs deliberately from the version in the originating product's tree**, which
states that Theia is the *only* GUI and no browser chrome exists. Copying that verbatim would
encode a constraint against a requirement this project has already delivered.

Power Browser's rule:

- Theia's shell is what opens, and it is the default GUI.
- A **stock** browser window is reachable — GUI-01, landed in plan 01-05. It opens via
  `window.open(url, '_blank')` from the Theia frontend
  (`theia/extensions/tab-uris/src/browser/browser-window-command.ts`). The shell window carries
  no `nsIBrowserDOMWindow`, so `nsWindowWatcher` cannot divert that call into a tab and falls
  through to `AppWindow::CreateNewContentWindow`, which opens `BROWSER_CHROME_URL`. Patch `020`
  no longer overrides that define, so `BROWSER_CHROME_URL` is stock upstream chrome. **No
  chrome-side command is registered, and that absence is the ratified design, not an omission.**
- **No custom browser chrome is authored.** No tab strip, no toolbar, no address bar, no menu of
  our own. That remains true and is the Milestone 2 boundary. What changed relative to the
  inherited rule is only that the stock browser window is *reachable* rather than *absent*.

---

## Phase-specific rules that outlive their phase

### No generator in Phase 1 — every branding value is a hand-written literal

This is deliberate and it is load-bearing. Phase 2's acceptance test is that generated output is
**byte-identical** to the files Phase 1 wrote by hand. A generator, template, or
derive-at-build-time helper introduced early destroys that test, because there is then nothing
independent to compare against. Write the literal.

### The residual-brand scan is a permanent gate

`node scripts/scan-brand-residue.mjs` must exit 0 over the whole tree with no class excluded. It
is registered as a `--quick` check and wired into `scripts/rebase-upstream.sh` and
`.github/workflows/rebase-upstream.yml`, so an upstream rebase that reintroduces a brand token
fails there rather than in a release.

Two traps, both hit for real:

- The scan iterates `git ls-files`. **An unstaged new file is invisible to it** — stage before
  you trust a green scan.
- Token classification lives in `inventory/brand-tokens.json`; that file is the only place the
  originating product may be named. Spelling the token in any other file makes that file fail
  the scan.

### Patches are regenerated, never text-edited

Regenerate a patch from a patched tree. Editing a hunk body by hand without recomputing its blob
hashes degrades the three-way merge into a **silent no-op**: the patch appears to apply and
changes nothing. `scripts/check-patch-surface.sh` guards the surface; `apply-patches.sh
--self-test` guards the mechanism.

---

## Verification

**One driver, one registry:** `scripts/verify-platform.sh`. `verify-phase-0{2,3,4,5}.sh` were
deleted in the commit that created it and must not come back.

```sh
scripts/verify-platform.sh --quick          # no build, no browser, no display — the commit gate
scripts/verify-platform.sh --only <label>   # exactly one check
scripts/verify-platform.sh                  # everything
scripts/verify-platform.sh --gate           # everything, plus the WINDOWS.md known-open exclusions
```

**Adding a check means appending one row to that registry.** It does not mean creating a sibling
driver — that rule is the entire reason the consolidation was necessary.

Two rules about what a check may be, both earned by shipping the mistake first:

1. **Never assert on the absence of a log line** unless you have proven that line is emitted by
   the code under test rather than by your own instrumentation. An absence assertion over an
   emitter you also wrote can never go red.
2. **Derive from the tree and compare; do not hand-keep an expectation list.** A hand-kept list
   can only ever agree with the tree it was copied from. `verify-registry-shape.mjs` and
   `verify-shell-error-copy.mjs` both derive their expectation at check time and compare as set
   equality, so they go red on an addition *and* a removal. Give a new check a `--self-test` that
   plants faults and requires each one to go red naming the drift.

---

## User-facing copy

`.planning/milestones/v1.0-phases/01-platform-extraction-and-rename/01-UI-SPEC.md` holds the design contract.
The rule that keeps being violated by accident: **no internal identifier may appear in
user-facing text.** No pref key, sentinel name, port, timeout, or raw exception message. Every
user-facing error string names the product as "PowerBrowser", states the problem in plain
language, and ends with a next step that is a real affordance on screen.

Nothing is dropped — every identifier a message does not carry appears as a labelled row in the
diagnostics layer, which exists for exactly that. `shell-error-copy-no-internals` enforces this
by pattern, not by a list of banned strings.

---

## Environment

Builds run inside Nix dev shells, never the host shell:

```sh
nix develop .#firefox    # Gecko toolchain (rustc, cargo, cbindgen, clang) — for upstream/
nix develop .#theia      # Node/yarn — for theia/
```

`node` and `objdir/dist/bin/powerbrowser` work outside a dev shell; `yarn` does not.

Build costs are real and are the reason the cheap static gates exist: a full `./mach build` is
tier 3 at roughly 47–54 minutes on the reference host. `--quick` runs in seconds. Use it before
you spend forty minutes discovering a typo. See `docs/BUILD.md`, whose timings each name the
tree, host, and toolchain they were measured on.
