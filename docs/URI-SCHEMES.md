# Tab addresses (URI schemes)

Every shipped tab in PowerBrowser has a typeable address of the form
`scheme:path` — no host, no query, no fragment, no encoded payload. This
document names every scheme the app registers, what the path encodes, what
an empty path means, and its open-versus-focus behaviour. It also states
the four cases that genuinely degrade, and why — those are documented
trade-offs, not defects to file.

The vocabulary used below (`open` / `reveal` / `activate`) is Theia's own
(`WidgetOpenMode` in `@theia/core`), not a parallel one this phase invents.
`open` attaches a widget to the shell for the first time; `reveal` scrolls
it into view without stealing focus; `activate` (the default for every
handler in this document) both reveals and focuses it.

## General rules

- **Canonical printed form is the opaque `scheme:path`** — never
  `scheme://authority`. A URI's authority component is lower-cased on
  serialization, and Theia's own widget ids are not uniformly lowercase, so
  the authority form would silently fork two spellings of one address into
  two widgets. (The two existing schemes that predate this phase —
  `preference:` and `vscode-extension:` — keep whatever form Theia's own
  code already emits; this rule governs the five schemes this phase adds
  or extends.)
- **Parsing is lenient, emission is canonical.** `scheme:x`, `scheme:/x`,
  `scheme:///x` and `scheme://x` all parse to the identical name. Exactly
  one form ever comes back out of the reverse lookup. This is why an
  address copied out of the app and typed back in by hand behaves
  identically regardless of which of the four spellings was typed.
- **The path is identity and identity only** — no query, no fragment, no
  JSON, no base64, no uuid. A URI's `toString()` percent-encodes the query
  component, so anything a human is expected to copy-paste exactly must
  come from `toString(true)`; the simplest way to guarantee that survives
  copy-paste is to have nothing in the address that ever needed encoding
  in the first place.
- **Non-user-chosen discriminators never appear in an address.** A
  randomly generated counter, a wall-clock creation token, a backend
  process id — anything the user did not choose and could not retype from
  memory — stays in the widget's construction options, never in the URI.

## `view:`

Addresses every singleton or stable-id docked or panel view — side-panel
views, bottom-panel views, and the handful of main-area singletons that
behave like a view rather than a document (the welcome tab, the bulk-edit
preview). The path is the widget or view-container id exactly as Theia
spells it internally — the same string the persisted layout's own
`constructionOptions.factoryId` already carries, so there is nothing to
translate between "the id" and "the address."

An empty path is not valid for this scheme; every `view:` address names one
specific target. Opening an unknown `view:` path raises a visible error
rather than silently resolving to nothing — a silent no-op is exactly wrong
at the moment a human has just typed the address by hand.

Open/focus: delegates to the target's own `AbstractViewContribution.openView()`,
so a `view:` open lands in the same panel, with the same reveal/activate
behaviour, as using the view's own menu entry or command — there is no
separate, possibly-different placement logic for the URI path.

### Coverage boundary

Included, and addressed **as containers, not as parts**: the Explorer is
`view:explorer-view-container`, not `view:files`. A view container's
composition mutates at runtime — dragging Debug's Variables part into the
Explorer's own container is ordinary Theia behaviour — so a container
address names a box, never a fixed set of contents. The same holds for
Search, SCM, and Test's own containers.

Excluded from this phase, and addressable later at zero design cost:
sub-views inside a container (`files`, `theia-open-editors-widget`, each of
Debug's five parts, each of SCM's three, each of Test's two, everything
under Timeline). Theia's own side-panel machinery only ever searches
top-level dock-panel widgets when expanding a view, so a part is a
collapsible section inside its container's tab, not a tab of its own — "no
tab without a URI" simply does not reach something that was never a tab.
`shell.activateWidget(id)` already walks down through a container to reveal
one of its parts, so adding per-part addresses later needs no new
machinery, only a table entry.

### The full `view:` address list

| Path | Container? |
|---|---|
| `problems` | no |
| `explorer-view-container` | yes |
| `outline-view` | no |
| `search-view-container` | yes |
| `scm-view-container` | yes |
| `debug` | no |
| `debug-console` | no |
| `disassembly-view-widget` | no |
| `test-view-container` | yes |
| `test-result-widget` | no |
| `test-output-view` | no |
| `callhierarchy` | no |
| `theia-typehierarchy` | no |
| `keybindings.view.widget` | no |
| `chat-view-widget` | no |
| `ai-configuration` | no |
| `ai-sessions-widget` | no |
| `bulkedit` | no |
| `plugins` | no |
| `vsx-extensions-view-container` | yes |
| `welcome` | no |

Plugin-contributed view containers (from an installed VS Code extension)
need no table entry: their widget id is already assigned as
`plugin-view-container:<viewContainerId>` at creation time, so the widget's
own `.id` **is** the full `view:` path — e.g.
`view:plugin-view-container:my-extension-container`.

### The `keybindings.view.widget` dots note

That path contains dots, which looks like it should be forbidden — this
phase's own path rule bans a dot in a *Navigatable* URI's final segment,
because `initResourceContextKeys` derives a file extension
(`resourceExtname`) from a Navigatable's path, and `settings:editor.fontSize`-shaped
input would otherwise yield a bogus `.fontSize` extension. `view:` addresses
are never Navigatable (see the "Terminal is the exception" note under
`terminal:` below), so that hazard cannot fire here. Theia's own widget id
cannot be changed without an upstream patch this project does not make, so
the id is kept verbatim, with this note attached rather than a workaround.

## `settings:`

Addresses the Settings widget. An empty path opens or focuses the widget
itself. A non-empty path is a preference id (e.g.
`settings:editor.fontSize`) and is delegated verbatim to Theia's own
already-bound preference open handler — this phase never reimplements
preference navigation, only routes to it.

Settings is its own scheme rather than a `view:` row because its widget
extends Lumino's raw `Panel`, not Theia's `BaseWidget` — the tab bar's own
navigable check requires `BaseWidget`, so Settings could never satisfy it
by any amount of method-stamping. That is also why this phase's widget→URI
direction is a registry lookup rather than a `Navigatable` implementation
on every addressable widget: Settings is proof that the two approaches are
not interchangeable, and the registry is the one that reaches both kinds.

Open/focus: same `openView()` delegation as `view:`.

## `terminal:`

The one genuinely multi-instance scheme in this set. The path is a short,
lowercase, user-facing name — `t1`, `t2`, … by default, or a name the
caller supplied — and that name **is** the terminal's instance identity,
not a label. Renaming a terminal's tab title changes only what is
displayed; the address a human typed to reach that terminal keeps working
unchanged, because re-keying the address on a rename would mean disposing
and recreating the shell underneath the user.

A terminal created with no caller-supplied identity is named `t1` on an
empty session, then `t2`, then `t3` — the lowest name not already in use,
so a session that has restored `t1` and `t3` from a previous layout
allocates `t2` next, never repeating a name still in use. Both the minted
name and the identity fields it is stored under land in the terminal's
persisted construction options, and replay verbatim when Theia restores a
layout — this is what makes a terminal's address survive a page reload:
open `terminal:t1`, reload, `terminal:t1` still resolves to the same shell.

An empty path means the active terminal, or a new one if none exists.
`terminal:t1` on a session where `t1` already exists focuses it and
creates nothing. `terminal:build` on a session where no terminal is named
`build` creates a fresh shell under that name, rather than erroring — the
tmux named-target model, and the reason an address like `terminal:build`
is worth typing at all instead of always meaning "the last terminal I had
open."

Terminal is the **only** widget type in this phase that implements a real
`Navigatable` — its widget genuinely extends `BaseWidget` (the tab bar's
navigable check requires that, and every other candidate, like Settings,
does not qualify), and tab-context URI selection is a real win for a type
where more than one instance is the normal case. Its resource URI equals
its `terminal:` address exactly. This does **not** enable Save-As on a
terminal: the Save-As gate first requires the widget to be a
`SaveableSource` (something with a `.saveable` property), and Terminal has
none — it fails that test before the Navigatable check the URI address
depends on is ever consulted.

## `pb-orca:`

A hosted Orca pane: one tab per Orca pane, mounting Orca's own view on
Orca's engine (Phase 64). The form is `pb-orca:<word><n>`, where the word
names the pane's Orca content type and `<n>` is the lowest index from 1
not already in use for that word — `chat1`, `chat2`, `term1` — the same
lowest-free rule as `terminal:`'s `t<n>`.

| Word | Orca content type |
|------|-------------------|
| `chat` | `agent-session` (an Orca chat) |
| `term` | `terminal` (one Orca terminal pane; a split terminal gives one tab per pane) |
| `sim` | `simulator` |
| `conflicts` | `conflict-review` |
| `checks` | `check-details` |

The path is identity only. The Orca tab id, the worktree id and the
terminal pane key — none of which the user chose — stay in the widget's
construction options, never in the address. The name is stored in those
options and replays when Theia restores a layout.

An empty path (`pb-orca:`) focuses the most recently active hosted Orca
tab, and creates nothing when none exists. A name that no open tab carries
opens nothing and logs one line; it never creates an Orca pane, because
Orca panes are created only by Orca (an agent, the Orca CLI, or the
"New Orca Chat" and "New Orca Terminal" commands).

Every Orca terminal, local or not, is `pb-orca:term<n>` and has no
`terminal:` address; `terminal:` names only PowerBrowser's own Theia
terminals. Orca editor, diff and browser panes are not hosted: they take
their target's address — a Theia editor's in Phase 65, a web tab's page
URL in Phase 66 — and until then open nothing.

Restore holds within one Orca server lifetime: after a frontend reload a
`pb-orca:` tab returns under the same name while its Orca pane still
exists, and closes if the pane is gone. Restore across a PowerBrowser
relaunch is Phase 65.

## `output:`

Already registered by `@theia/output`; this phase adds only the missing
widget→address direction and fixes the direction that already shipped. The
path is a channel name (e.g. `output:Tasks`), and the address always
carries the widget's **active** channel — never a bare `output:` with the
channel silently dropped. Opening `output:<channel>` selects that channel
in the Output panel and reveals it.

The Output widget is a **singleton** whose visible content swaps per
channel — see the carve-out below for what this means for round-tripping.

## `preference:`

Already registered by `@theia/preferences` at a fixed priority, unchanged
by this phase. The path is a preference id (e.g.
`preference:editor.fontSize`); opening one reveals that setting inside the
Settings widget. No competing handler is registered for this scheme —
confirmed live, none of this phase's own open handlers claim it.

## `vscode-extension:`

Already registered by `@theia/vsx-registry`. Addresses the detail editor
for one installed (or installable) extension, keyed by its extension id
and an optional version — e.g. `vscode-extension://my-publisher.my-ext/1.2.3`.
This scheme keeps the authority form Theia's own code already emits; the
opaque-form rule above governs the schemes this phase introduces or
extends, not a scheme this phase only reads from.

## `webview:` (session-scoped)

New in this phase, and explicitly **not** restore-safe across a restart —
see the carve-out below. The path is `<viewType>/<panelId>`, both minted by
the plugin host at the moment an installed extension calls
`createWebviewPanel`. Within the session that created it, opening the
address reopens the exact same panel — Theia's own widget cache resolves
it as a hit, with all its real content still attached. There is nothing to
type from memory here (a panel id is not human-mnemonic), but the address
still round-trips: copy it out of the registry, and pasting it back into
the same session's opener reopens the same tab.

A degenerate `webview:<id>` address (no `/<viewType>` segment) is resolved
against already-open panels by `id` alone rather than treated as a request
to create one — opening it raises a visible error if no open panel matches,
the same "an unknown or under-specified address must surface an error, not
silently mint something new" discipline `view:` applies. The two-segment
form is the only one this phase's own registry ever emits, so this case is
reached only if an address is typed or constructed by hand.

## `http:` / `https:` (web tab — the address is the page URL)

GUI-02. The address of a web tab is its **current page URL as chrome reports
it** — the canonical form after the first location change, so `example.com`
typed into the pill becomes `https://example.com/` once the page has loaded.
The registry reads it live from the widget, never from the options the tab
was opened with: a tab that has navigated has moved on from its opening URL,
and its address moves with it.

Opening any `http` or `https` URI through the opener service lands in an
in-shell web tab — a main-area Theia tab whose page is rendered by a
chrome-owned overlay kept aligned with the tab's node. Every opener in the
tree takes that route without knowing a web tab exists: the chrome bar
(typed commits, suggestion rows, and "+", which opens the empty page),
named-setup restore, Panorama, and a Theia link open all resolve to the same
handler.

The per-session tab counter is a construction option and never part of the
address (general rule 4 above), so two tabs on one URL are two widgets with
one address — the same address model as `terminal:` names, in reverse: here
the user chose the URL and did not choose the counter.

The chrome-side store does not key its rows by the address. Each web tab has
a row of its own, keyed `web:<id>` by the tab's identity, with the page
address as a column (docs/TAB-STORE.md, "Row keys"): two tabs on one URL are
two rows, a navigation updates the row in place, and closing a tab marks its
row closed instead of deleting it.

A tab with no page (a fresh "+") carries the empty-page address internally
and shows an **empty** pill with the address placeholder; the internal URL is
never rendered.

The browser-window destination below is unchanged and remains the only
stock-window path.

## The four carve-outs

These are the cases D-51 identified as unavoidable inside this phase's
scope, and each is asserted as documented behaviour rather than treated as
a failure by `scripts/verify-uri-roundtrip.mjs`. The wording below matches
`existing-scheme-coverage.ts`'s own `CARVE_OUTS` list verbatim, so this
document and the code never drift apart on what each one says.

1. **`output`** — `@theia/output`'s widget is a singleton whose content
   swaps per channel — `output:A` and `output:B` resolve to the same tab
   (factory id `outputView`).
2. **`editor-preview`** — `@theia/editor-preview` swaps the document a tab
   shows without user navigation, so a tab's resource URI mutates in place
   — not mechanically probable without a live preview-triggering
   navigation.
3. **`vscode-notebook-cell`** — notebook's `vscode-notebook-cell:` handler
   is a registered scheme that opens no tab and returns `undefined`.
4. **`webview`** — `webview:` addresses only round-trip within a session —
   panel ids are minted per `createWebviewPanel` call by the plugin host,
   so without a live plugin-contributed panel this cannot be probed
   mechanically.

## The browser-window destination (not a scheme)

Every address above resolves to a **tab inside Theia** — web addresses
included, which since GUI-02 open as in-shell web tabs. There is one more
destination a URL can be sent to, and it is deliberately not a scheme: a
**stock Firefox browser window**, opened by the palette command below, which
is the one stock-window destination in the tree

- id: `powerbrowser.open-browser-window`
- label: **Open Browser Window**

Both strings are exactly the ones
`theia/extensions/tab-uris/src/browser/browser-window-command.ts` exports
(`OPEN_BROWSER_WINDOW_COMMAND_ID` and the `label` on `OPEN_BROWSER_WINDOW`),
so this document and the code are checked against identical wording rather
than kept as drifting copies — the same discipline the four carve-outs above
follow. `scripts/verify-gui01-command.mjs` reads both out of that source and
asserts them against the live frontend's own command registry.

The command is reachable from the command palette and nowhere else in this
phase: there is no menu entry, no keybinding, and no toolbar button. It takes
an optional URL. With none, the window opens on `about:blank` and the stock
address bar is the affordance; with one, the window opens on that URL. It is a
**peer** of the in-Theia destinations, not a fallback below them — no opener
priority is involved, because nothing routes to it automatically. A user (or,
from the next phase, a web tab's own escape action) chooses it.

What opens is upstream Firefox's own `browser.xhtml`, unmodified: real address
bar, real tab strip, real in-window modal dialogs, and zero PowerBrowser
styling. Invoking the command twice opens two such windows, which is Firefox's
own multi-window behaviour. Closing one returns focus to the shell window and
never quits the application, so the return half of the toggle can never
silently become a loss of Theia state.

**Accepted behaviour: a brief startup flicker.** On a cold start the platform
opens an early blank window before any of this project's code runs. PowerBrowser's
command-line handler claims the launch and opens the shell itself, at which
point upstream's own default handler closes that early window rather than
reusing it — producing a brief flicker that upstream's own comment at that
branch calls acceptable. This is documented behaviour, not a defect to file:
it is the direct consequence of startup-window selection living in the
command-line handler instead of a compiled brand value, which is what keeps
the browser window structurally reachable at all.

## What this is for

`TabUriRegistry`'s exported shape (`getViewContribution`, `parseName`,
`createWidgetOptions`, `uriOf`) is the interface the post-4.0 unified
browser bridge consumes to model a Theia tab as a chrome-owned tab —
deliberately small and stable, not a place to grow speculative surface.
Nothing in v4.0 itself renders these addresses anywhere in Theia's own tab
bar; that presentation work is bridge scope, not this phase's.
