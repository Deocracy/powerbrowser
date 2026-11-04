# Power Browser

A rebrandable browser platform: a Gecko shell hosting an Eclipse Theia sidecar
as its default GUI. The browser boots, supervises a bundled Theia backend on
localhost, and presents the IDE as the interface. Web pages and editors run in
the same application, on a real browser engine.

The substrate is Firefox, not Electron, because the point is to have a **whole
browser** — not a browser-shaped shell around an editor. Everything a real
browser does, it does: DRM and streaming, the full WebExtensions API, per-site
process isolation, Mozilla's security patch stream. An Electron app can imitate
none of that.

## What this repo is

Power Browser is a **platform**, and it is deliberately agnostic. It has no
opinion about how you should code — no bundled database, no curated extension
set, no workflow baked in, no branding beyond a neutral default. It ships that
way on purpose, so anyone can remake it into the environment they actually
want.

This is not a Firefox fork. It is a patch-set repo: an `upstream/` checkout
pinned to an ESR tag, a small stack of patches, and this tree.

```
Firefox ESR + Eclipse Theia     upstream — consumed, never modified
            ↓
      Power Browser             this repo — the platform
            ↓
       distributions            downstream — add, never patch
```

## Rules we hold ourselves to

- **Gecko is never modified outside the patch stack.** `upstream/` is fetched,
  never hand-edited. Firefox internals are reached through one anti-corruption
  layer, and every touchpoint is catalogued.
- **Theia core is never forked.** `@theia/*` are npm dependencies; everything we
  add is a `@powerbrowser/*` Theia extension. Upstream Theia is adopted by
  re-pinning a version.
- **Downstreams add, never patch.** If a distribution needs to change a file in
  here, that is a bug in our boundary — the platform needs an extension point.
- **Theia is the default GUI, not the only one.** A stock browser window stays
  reachable. No custom browser chrome is authored.

Keeping the patch stack small is what keeps upstream updates cheap: ESR rebases
roughly every two weeks, Theia upgrades by changing a version number.

## Rebranding

Anyone redistributing a Firefox derivative **must** rebrand it — Mozilla's
trademark policy requires it. Power Browser is built so that renaming the
product, swapping icons, and repointing or disabling telemetry happen through
two inputs and nothing else: [configuration.toml](configuration.toml) and
[brand/](brand/). Edit a value, run `node scripts/generate.mjs`, and every
derived build surface follows.

See [docs/REBRANDING.md](docs/REBRANDING.md). For the customization layers a
downstream gets without rebranding, see [docs/CUSTOMIZE.md](docs/CUSTOMIZE.md)
and [docs/URI-SCHEMES.md](docs/URI-SCHEMES.md).

## Building

Two Nix dev shells build the two halves — `nix develop .#theia` for the Theia
sidecar, `nix develop .#firefox` for the Gecko shell. The repo must live at a
path containing no space character; `pkgs.mkShell` appends an rpath to the
space-separated `NIX_LDFLAGS`, and a space breaks every native link step in
both halves.

[docs/BUILD.md](docs/BUILD.md) has the exact commands, measured durations, and
a fresh-clone verification.

## Verification

`scripts/verify-platform.sh` is the single driver, and every check is a row in
its registry.

```sh
scripts/verify-platform.sh --quick   # no build, no browser, no display — the commit gate
scripts/verify-platform.sh           # everything
scripts/verify-platform.sh --gate    # everything, plus the known-open exclusions
```

## Status

Alpha. Both halves build and run on the reference host. Pinned to Firefox ESR
153 (`FIREFOX_153_5_1esr_RELEASE`) and Theia 1.76.0, Linux first. The rebrand
manifest and generator are complete; the remaining verification is live-build
drills that need a human at a screen.
Release builds are en-US only: no other locale or language pack ships.

## License

PolyForm Noncommercial 1.0.0. See [LICENSE](LICENSE).

---

A project of [Deocracy](https://github.com/Deocracy).
