# Rebranding Power Browser

Power Browser is a rebrandable browser platform: a Gecko shell hosting an
Eclipse Theia sidecar as its default GUI. A downstream rebrand edits exactly
two inputs — `configuration.toml` and `brand/` — and touches nothing else in
the tree. This guide takes a reader from a fresh clone to a branded build,
then documents every `configuration.toml` field.

The two-input rule is load-bearing. `node scripts/generate.mjs` reads
`configuration.toml` and rewrites the derived build surfaces under
`generated/`; no other file is edited to change the brand. If a rebrand step
seems to require editing anything outside `configuration.toml` and `brand/`
(plus the one marked companion file in step 6 below), stop — that is the
signal to re-read the step, not to edit the file.

## Walkthrough: clone to branded build

### 0. Prerequisites

- A checkout path containing **no space character**. The build appends an
  rpath to the space-separated `NIX_LDFLAGS` variable, so a space in the
  path breaks every native link step. Clone somewhere like
  `~/coding/Acme-Browser`, never under a directory such as `~/My Projects`.
- `git` and Nix with flakes enabled (`experimental-features = nix-command
  flakes`). Nothing else is installed by hand.
- Two Nix shells, each serving one half of the tree. Use the wrong shell
  and the tool you need is simply absent:
  - `nix develop .#firefox` — the Gecko toolchain (rustc, cargo, cbindgen,
    clang). Used for everything under `upstream/`.
  - `nix develop .#theia` — Node and yarn. Used for everything under
    `theia/`, and for `scripts/generate.mjs`.
  - `yarn` does not work outside either shell. Plain `node` does, but the
    generator is the exception: it rasterises `brand/mark.svg` through
    `inkscape`, which only the `.#theia` shell supplies at the pinned
    version. Run `nix develop .#theia --command node scripts/generate.mjs`
    rather than bare `node`, or the icon step fails — and a differently
    versioned `inkscape` found on the host is worse, because it produces
    rasters that then fail the byte-identity check.

### 1. Clone

```sh
git clone <repo-url> <space-free-path>
cd <space-free-path>
```

### 2. Generate first, before anything else

```sh
node scripts/generate.mjs
```

Run this before `scripts/fetch-upstream.sh`: the fetch script reads its
default tag out of `generated/upstream-pins.env`, which only exists after a
generate. Without it the fetch fails naming the re-run command.

Watch the output. Every setting the rebrand inherits from Power Browser's
own defaults is echoed on stderr as a `generate: default applied` line
naming the dotted path and the value. There are no silent defaults: if a
line surprises you, that setting belongs in your `configuration.toml`.

### 3. Fetch the upstream checkout

```sh
scripts/fetch-upstream.sh
```

This clones the pinned ESR tag into `upstream/` (about 5.6 GB, roughly
7–11 minutes on a normal link). It is safely re-runnable: against an
existing checkout at the pinned tag it verifies instead of re-cloning.
`upstream/` is never hand-edited.

### 4. Edit `configuration.toml`

This file is the only text file a rebrand edits. Every key under
`[identity]`, `[legal]`, and `[upstreams]` is **required**: omitting one is
a hard failure naming the setting, never a quiet fallback to Power
Browser's values. A downstream that forgot its own display name would
otherwise ship Power Browser's mark in its own window title — the required
table is what stops that. Optional keys are documented in the reference
below with exactly what omission does.

After editing, re-run `node scripts/generate.mjs`. Then prove the tree is
fresh:

```sh
node scripts/generate.mjs --check
```

`generate.mjs --check` asserts idempotence — a second run produces the same
bytes — and reports fresh, stale, absent, and leftover outputs as four
distinct outcomes.

### 5. Read the rebrand surface map

Three facts from the tree that decide what a rebrand can and cannot move:

- The vendor is **two** settings, never one. `product.vendor_machine` is
  lowercased into the profile directory path with no space stripping, so
  a display form with a space would put a space in that path. The machine
  value must be path-safe; it may equal the display value only when the
  display value has no space.
- `identity.display_name` sits under `[identity]`, not `[product]`,
  because it must be required (see step 4).
- These identifiers are fixed forever and no manifest value changes them:
  the `powerbrowser/` source tree, the `@powerbrowser` npm scope, the
  `chrome://powerbrowser/content/` package, the `Firefox` user-agent name,
  the `Firefox` product-name compatibility term, the `unofficial` installer
  channel, and the untouched application ID. A downstream renames its brand,
  never these.

### 6. Drop in the logo

Replace `brand/mark.svg`. The replacement must keep the contract the
preflight gate pins:

- A square viewBox: `viewBox="0 0 128 128"`. The icon pipeline rasterizes
  square rasters from this one source; a non-square logo fails loudly.
- The dual-fill rule: two fills driven by the OS theme (a dark fill plus a
  `prefers-color-scheme` rule flipping it light), because the mark ships as
  a favicon that follows the OS theme independently of the shell. Invent no
  brand hue the manifest does not already carry.
- The `<svg>` element stays on **one line**, and the identical string is
  copied into the `POWERBROWSER_MARK_SVG` template literal in
  `theia/extensions/branding/src/browser/powerbrowser-mark.ts`. The
  preflight asserts the two are byte-equal; they are never edited apart.
  This companion file is the single exception to the two-input rule, and it
  exists only because the widget needs a boot fallback before the generated
  fragment loads.

### 7. Build (tier 3, roughly an hour)

The full build procedure, costs, and tiered rebuild loop live in
`docs/BUILD.md` — read it before spending the hour. The branded sequence:

```sh
scripts/fetch-upstream.sh
nix develop .#firefox
cd upstream
MOZCONFIG=../.mozconfig ./mach build
```

Branding is build-time only: there is no hot rebrand. A manifest edit means
re-running `node scripts/generate.mjs` plus whatever rebuild tier the
touched surface needs (`docs/BUILD.md` maps files to tiers); a Gecko
branding change is a full compile, and the Theia sidecar rebuilds
separately inside `nix develop .#theia` (`yarn build` in `theia/`, full
sequence in `docs/BUILD.md`).

### 8. Verify

```sh
scripts/verify-platform.sh --quick
```

`scripts/verify-platform.sh --quick` is the commit gate: static checks only,
no build, no browser, no display. After the tier-3 build, run the
six-surface identity proof against the artifact:

```sh
node scripts/verify-branding-identity.mjs
```

It asserts exact equality on all six surfaces read from the built tree:
the executable (a `powerbrowser` binary present, no `firefox` remaining),
`application-ini` name and vendor, `runtime-identity` from a live headless
launch sentinel, `brand-full-name` agreeing across `brand.ftl` and
`brand.properties`, the `desktop-entry` name, and `version`.

## Rebranding from an external config directory

The walkthrough above edits the platform tree's own `configuration.toml`
and `brand/` in place. A downstream that keeps its brand in its own repo
does the same rebrand without touching the platform tree at all: the two
inputs live in an outside directory, and the `PB_CONFIG_DIR` variable points
the generator at them. This section was carried through against a scratch
outside directory holding a copy of a fixture brand before it was written,
so every command below is pasted, not reviewed.

### Layout

The outside directory mirrors the in-tree layout with exactly two entries:

```sh
<dir>/configuration.toml
<dir>/brand/mark.svg
```

A space-free path (for example `~/coding/Acme-Brand`) keeps every shell
paste below free of quoting hazards.

### Generate and check

Prefix the step 2 and step 4 commands with the directory. Everything else
about those steps is unchanged — generate first, before
`scripts/fetch-upstream.sh`, re-run after every edit, then prove freshness:

```sh
PB_CONFIG_DIR=<dir> node scripts/generate.mjs
PB_CONFIG_DIR=<dir> node scripts/generate.mjs --check
```

Nothing is written beside the outside config: `generated/` stays in the
platform tree, and the fetch script reads its default tag out of the
platform tree's `generated/upstream-pins.env`, which carries the staged
`upstreams.firefox_esr_tag` after a prefixed generate. With `PB_CONFIG_DIR`
unset, the generator reads the platform tree's own `configuration.toml`
and `brand/`, exactly as the walkthrough shows.

### What still applies unchanged

- The two-input rule: from outside the tree, the inputs are still only
  `configuration.toml` and `brand/mark.svg`. The step 6 companion file is
  the same single exception.
- Required keys stay required: omitting `identity.display_name` (or any
  other required setting) under the outside directory is the same hard
  failure naming the setting, never a quiet fallback to Power Browser's
  values.
- The fixed identifiers from step 5 stay fixed: the `powerbrowser/` source
  tree, the `@powerbrowser` npm scope, the `chrome://powerbrowser/content/`
  package, the `Firefox` user-agent name, the `Firefox` product-name
  compatibility term, the `unofficial` installer channel, and the untouched
  application ID. A downstream renames its brand, never these.
- Profile migration crosses the same substitution: the profile directory
  path embeds the lowercased `product.vendor_machine` alongside
  `identity.app_basename`, so a downstream that changes either carries its
  profile across by substituting the new values into the path and copying
  before first launch, as the obligations section describes.

## Reference: every `configuration.toml` field

One row per setting the generator's schema knows. The coverage gate
(`scripts/verify-rebranding-docs.mjs`) derives this list from the same
schema table that rejects unknown settings, so a setting added to the
manifest without a row here fails the build. "Required" means the
downstream must state it — omission is a hard failure naming the setting.
"Optional" means omission is legal; the row states the default, which is
also echoed at generate time as a `generate: default applied` line.

**Removed setting.** The `[ai]` table (`backend`) was removed in v1.4 together
with the OpenCode adapter. A manifest that still carries it now fails with
`unknown setting 'ai.backend'`; delete the table — nothing replaces it.

### `[product]` — who ships this browser

| Setting | Required? | If omitted | Reaches |
|---|---|---|---|
| `product.vendor_machine` | Required | Hard failure | `generated/identity.configure` as `MOZ_APP_VENDOR`; lowercased into the profile directory path |
| `product.vendor_display` | Required | Hard failure | `brand.ftl` vendor name, installer `CompanyName` |
| `product.description` | Optional | Nothing emitted; no surface consumes it today — kept as the human-readable summary of the product | None (declared and validated only) |
| `product.homepage` | Optional | Falls back per consumer; product metadata, never a contacted surface | In-app repo link and Eclipse sentence home clause when no `installer.support_url` is stated; installer defines require one of the two |
| `product.revision` | Required | Hard failure; a quoted value, or a number written with a decimal point (`1.5`, and also `1.0`), is refused | `powerbrowser/packaging/version/release.txt` as the release key `v<ESR>-<revision>`. A whole number of at least 1, unquoted; reset to 1 when the ESR pin moves, increased for a rebuild on the same ESR |

### `[identity]` — the application identity (all required)

| Setting | Required? | If omitted | Reaches |
|---|---|---|---|
| `identity.display_name` | Required | Hard failure | Window display name plus variant suffix, locale full/short names, desktop entry name, installer display names, Theia application name, Mozilla sentence |
| `identity.app_basename` | Required | Hard failure | `.mozconfig` app basename, installer identity second half, profile path |
| `identity.binary_name` | Required | Hard failure | The executable name under `objdir/dist/bin/` |
| `identity.remoting_name` | Required | Hard failure | Single-instance remoting name, desktop `StartupWMClass` |
| `identity.distribution_id` | Required | Hard failure | `.mozconfig` distribution id, installer bundle identity first half |

### `[legal]` — ownership declarations (all required)

| Setting | Required? | If omitted | Reaches |
|---|---|---|---|
| `legal.license` | Required | Hard failure | Declared and validated only — no emitted build bytes today |
| `legal.copyright_holder` | Required | Hard failure | Declared and validated only — no emitted build bytes today |
| `legal.trademark_notice` | Required | Hard failure | About dialog legal notices, verbatim, first notice |

### `[theia]` — the sidecar surface (all optional)

| Setting | Required? | If omitted | Reaches |
|---|---|---|---|
| `theia.default_theme` | Optional | Theia's own default pair; no failure | `generated/theia-frontend-config.json` default theme (must name a builtin: dark, light, `hc-theia`, `hc-theia-light`) |
| `theia.welcome_text` | Optional | Null — the welcome widget renders no element | `generated/theia-branding.json` welcome text |
| `theia.about_text` | Optional | Null — the about dialog renders no element | `generated/theia-branding.json` about text |

### `[urls]` — update and info endpoints (all optional)

| Setting | Required? | If omitted | Reaches |
|---|---|---|---|
| `urls.release_notes` | Optional | In the platform manifest: `about:blank` hides the About dialog's release-notes link, and the update-details link is empty. A downstream that changes the product name and states no `urls.release_notes` inherits the platform's own release-notes page, and generate refuses it, as it refuses an inherited `urls.update`. | The About dialog's release-notes link (`app.releaseNotesURL`, `app.releaseNotesURL.aboutDialog`) and update-details link (`app.update.url.details`) in both branding pref files, plus `generated/endpoint-hosts.json` host coverage. A click destination: its host is a `user-initiated` allowlist entry. |
| `urls.update` | Optional | No update host is emitted, so upstream's default stays. A downstream that states no `urls.update` inherits the platform's own host, and generate refuses it (Task 15, R11). | `application.ini` `[AppUpdate]` URL host (`MOZ_APPUPDATE_HOST`, through `generated/identity.configure`), and `generated/endpoint-hosts.json` host coverage. `powerbrowser/distribution/policies.json` carries no update URL (check `ng064-update-url-from-manifest`). |
| `urls.mar_origin` | Optional | `release-manifest.json` records `mar_origin` as `null`, and the descriptor job's form gate refuses to commit a descriptor. Generate and `generate --check` refuse any value that is not a lower-case https origin naming only a host (at least two dot-separated labels, no port, path, query or trailing slash), before any build starts. | The update descriptor's patch URLs, `<mar_origin>/<tag>/<asset>` (DIST-08, the 2026-10-29 owner ruling), plus `generated/endpoint-hosts.json` host coverage. The origin is an unattended fetch host, never a click destination: its host is an `allow` allowlist entry. |
| `urls.crash_report` | Optional | Blank report URL default | Crash-report URL default plus `generated/endpoint-hosts.json` host coverage when stated. Only its scheme, host and port become the crash submit address (`<origin>/submit`); the full value, path included, is the about:crashes report view link. A user name and password in it are refused. The receiver in `worker/crash-submit.mjs` serves only `/submit`, so a view link on its host has no page |
| `urls.homepage` | Optional | In the platform manifest: an empty manual-update link in the About dialog. A downstream that changes the product name and states no `urls.homepage` inherits the platform's own download page, and generate refuses it. | The About dialog's manual-update link (`app.update.url.manual`) in both branding pref files, plus `generated/endpoint-hosts.json` host coverage. A click destination: its host is a `user-initiated` allowlist entry. |
| `urls.search` | Optional | Omitted from the endpoint-hosts fragment | `generated/endpoint-hosts.json` host coverage when stated |

### `[installer]` — Windows installer branding (both optional)

| Setting | Required? | If omitted | Reaches |
|---|---|---|---|
| `installer.support_url` | Optional, but one of it and `product.homepage` must be set or generate fails | Falls back to `product.homepage`; both unset is a hard failure | Installer URL defines, in-app repo link, Eclipse sentence home clause, endpoint hosts |
| `installer.tile_color` | Optional | Tile manifest line omitted; the OS tile default applies | Windows tile manifest background color (a `#rrggbb` value) when stated |

### `[telemetry]` — product telemetry (both optional)

| Setting | Required? | If omitted | Reaches |
|---|---|---|---|
| `telemetry.level` | Optional | Resolves to `off` with the standard default echo; nothing ever leaves the application | `generated/theia-telemetry.json` level (one of off, crash, error, all); an enabled level with no endpoint fails naming `telemetry.endpoint` |
| `telemetry.endpoint` | Optional | Inherits the platform's events endpoint. At a level other than off, a downstream under its own name that inherits it is refused naming `telemetry.endpoint`; at level off the inherited value stays in the fragment (see Downstream obligations) | `generated/theia-telemetry.json` endpoint plus endpoint hosts when stated (must be your own https URL, or `""` for none) |

### `[upstreams]` — upstream pins (both required, never inherited)

| Setting | Required? | If omitted | Reaches |
|---|---|---|---|
| `upstreams.firefox_esr_tag` | Required | Hard failure; must be an `*esr_RELEASE` tag, never a `_BUILDn` candidate | `generated/upstream-pins.env`, the fetch script default; the ESR version in `powerbrowser/packaging/version/version.txt` and the release key in `powerbrowser/packaging/version/release.txt` |
| `upstreams.theia_release` | Required | Hard failure | Exact triple enforced across every `@theia/*` pin and the lockfile by `verify-upstream-pins`; the generator emits no fragment for it |

### `[[variants]]` — build variants (every key required per element)

| Setting | Required? | If omitted | Reaches |
|---|---|---|---|
| `variants[].id` | Required | Hard failure | Selects the variant; must match a built id (`dev`, `release`) |
| `variants[].name_suffix` | Required | Hard failure | Display-name suffix; the release suffix is deliberately empty (the only key allowed to be). Must be stated, may be blank |
| `variants[].branding_dir` | Required | Hard failure | Emitted as content only — never used as a write target |
| `variants[].objdir` | Required | Hard failure | Emitted as content into `.mozconfig` as the default object directory — never used as a write target. No manifest value can direct a write |

A downstream that states no `[[variants]]` at all inherits Power Browser's
two — a variant is a build arrangement, not an identity. A downstream that
states one must complete it.

### `[[extensions]]` — declared sidecar extensions (absent block means none)

| Setting | Required? | If omitted | Reaches |
|---|---|---|---|
| `extensions[].id` | Required | Hard failure | `generated/theia-plugins.json` download map, one exact URL per entry |
| `extensions[].source` | Required | Hard failure | URL construction: `openvsx` builds the versioned file URL, `url` uses the stated address verbatim, `npm` builds the registry tarball URL, `local-path` builds the packed-archive reference |
| `extensions[].version` | Required when `extensions[].source` is `openvsx` or `npm` | Hard failure for Open VSX and npm entries (latest-resolution is the unpinned behavior this forbids; npm additionally requires an exact full version, so `latest`, partials, wildcards, and ranges all fail) | Pinned version inside the download URL |
| `extensions[].url` | Required when `extensions[].source` is `url` | Hard failure for direct-URL entries (nothing to download) | Download address verbatim (must be a downloadable archive; may carry the `${targetPlatform}` downloader placeholder, which passes through unexpanded) |
| `extensions[].integrity` | Required when `extensions[].source` is `npm` | Hard failure for npm entries (guards a registry republication under the pinned version) | Registry SRI digest recorded at pin time (`npm view <id>@<version> dist.integrity`) |
| `extensions[].path` | Required when `extensions[].source` is `local-path` | Hard failure for local-path entries (nothing to pack); an absent folder additionally fails the pin gate naming the entry | Project-relative folder the download step packs to hashable bytes (packed reference is `<path>.tgz`) |
| `extensions[].sha256` | Required | Hard failure | Hash of the download archive bytes |

This project declares none, so the block stays absent. A downstream drops
an inherited entry by restating the list without it — arrays replace, never
merge.

### `[[webextensions]]` — declared WebExtensions (absent table means none)

| Setting | Required? | If omitted | Reaches |
|---|---|---|---|
| `webextensions[].id` | Required | Hard failure | `generated/webextensions-settings.json` ExtensionSettings map, one entry per add-on id |
| `webextensions[].installation_mode` | Required | Hard failure (no silent default; an unknown mode fails naming the id) | ExtensionSettings entry mode, one of `force_installed` or `normal_installed` |
| `webextensions[].install_url` | Required | Hard failure | ExtensionSettings entry URL (must be `https://` or `file:///`); an `https` origin must be covered in `powerbrowser/endpoint-allowlist.json`, which `verify-webextensions` fails naming the host |

This project declares none, so the tracked `ExtensionSettings` key rests at
the empty object. A downstream drops an entry by restating the list without
it — arrays replace, never merge. No add-on binary is ever vendored into
the tree: the mechanism (declaration plus policy) is platform work, the
curated list stays downstream data.

### `[[search_engines]]` — search engines (absent table means Firefox's own engines)

| Setting | Required? | If omitted | Reaches |
|---|---|---|---|
| `search_engines[].name` | Required | Hard failure | `generated/search-engines.json` and the `SearchEngines` policy's `Add` entry `Name`; the first entry's name is the `Default`. A name equal to one Firefox ships (`DuckDuckGo`, `Wikipedia (en)`, ...) is rejected by `verify-search-engines`, because the browser drops a second engine of the same name without a word; two entries differing only in capital letters fail generate |
| `search_engines[].url` | Required | Hard failure | The entry's `URLTemplate`: an `https://` address holding `{searchTerms}` where the typed text goes. Its host must be an allowlist row in `powerbrowser/endpoint-allowlist.json`, which `theia-endpoints` fails naming the host |
| `search_engines[].suggest_url` | Optional | No suggestions from that engine | The entry's `SuggestURLTemplate`, same shape and the same allowlist rule as `url` |

The first entry is the default engine, and the address bar lists only the
configured engines while the policy is active. This project ships DuckDuckGo
Lite (default) and Wikipedia; no template carries a partner or tracking
parameter. Arrays replace, never merge: a downstream replaces the list by
restating it.

## Downstream obligations

- **Own unique identity.** State every required key for yourself. Required
  keys are masked from the defaults layer precisely so a partial manifest
  cannot silently ship Power Browser's name, vendor, or tag.
- **No Power Browser marks.** The name, the placeholder mark, and the
  trademark notice stay with this project. Your `legal.trademark_notice`
  names your product and holder.
- **Mozilla non-association.** State that your product is not officially
  associated with Mozilla or its products, and never imply endorsement.
  The About dialog carries this sentence by construction.
- **Eclipse Theia attribution.** The About dialog attributes Eclipse Theia
  as a trademark of Eclipse Foundation AISBL and identifies your product's
  home from your support URL. Keep that sentence intact.
- **Own telemetry endpoint.** State `[telemetry] endpoint` yourself, even at
  level `off`: your own https URL, or `""` for none. Generate refuses an
  inherited platform endpoint only when the level is not `off`. At level
  `off` an omitted endpoint stays the platform's value in
  `generated/theia-telemetry.json`, so a user who raises the telemetry
  preference in your build would send reports to Power Browser's host.
- **Artwork review.** Open `brand/mark.svg`, confirm it carries no
  third-party mark, and sign name and date into `brand/HUMAN-REVIEW.md`.
  The mechanical trademark gate covers everything except this human look.
- **Profile migration on rebrand.** The profile directory path embeds the
  lowercased `product.vendor_machine` (no space stripping) alongside
  `identity.app_basename`, so changing either strands the previous profile
  under the old path. Before first launch of the rebranded build, locate
  the current profile directory — the `--profile` path the binary is
  launched with, also recorded per launch in the supervisor's
  `sidecar-state-<profile>.json` file in the settings directory — derive
  the new path by substituting your new lowercased vendor and basename,
  and carry the profile across:

```sh
cp -r "<old-profile-dir>" "<new-profile-dir>"
```

  Launch only after the copy. A first launch without it mints an empty
  profile while the real one sits orphaned under the old path.
