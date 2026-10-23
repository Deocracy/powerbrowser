---
phase: "31"
slug: site-identity-permissions-and-app-menu
status: draft
shadcn_initialized: false
preset: none
created: "2026-10-22"
---

# Phase 31 — UI Design Contract

> Visual and interaction contract for the identity box, site panel, shield, and hamburger menu. Generated autonomous (`--auto`); extends 29-UI-SPEC and 30-UI-SPEC, which remain in force.

**Scope note.** Tokens, row geometry (32px rows, 432px panel cap), type (14/13/12px), colour (`--theia-*` only), focus ring, motion, layer policy (a)-(d), Esc sequence, and the `{App}` / `{engine}` copy rules are inherited and not re-specified unless they change. This spec adds:

- the identity box (lock / "Not Secure" / warning / shield + permission icons + host with registrable-domain highlight + punycode)
- the site information panel (connection, certificate, permissions, clear-data, shield exception)
- the hamburger button + menu in Coding/Browsing/Organising (Firefox order, filtered to landed features + Settings/Passwords/Add-ons/Quit)
- Ctrl+Q / Quit copy and placement

Hard rules binding every row: no Theia core patch; no Firefox internal outside `PowerBrowserAPI.sys.mjs`; no custom browser chrome beyond the chrome bar; no internal identifier in user-facing text; product name from `appSubject()` only.

**Visual mockups:** static ASCII below (no HTML mockup file this phase, per 31-CONTEXT Specifics).

---

## Design System

| Property | Value |
|----------|-------|
| Tool | **none**. No Vite/Next app; Theia widgets inherit `--theia-*` theming; a second token system would fork theming and break rebrand-without-recompile. No `components.json` in the tree. |
| Preset | not applicable |
| Component library | `@theia/core@1.76.0` primitives only: `ReactWidget`, `ContextMenuRenderer` + `MenuPath` + `CompoundMenuNode`, `ConfirmDialog` (clear-data confirm), `HoverService` tooltips. No new widget framework. |
| Icon library | Codicons from `@vscode/codicons@0.0.45` (649 glyph rules, installed). Glyphs used: `lock`, `unlock`, `shield`, `shield-x` (fallen back to `shield` + warning colour if absent — executor greps `dist/codicon.css` at build time and the static gate asserts), `warning`, `info`, `eye` (camera), `mic` (microphone), `location` (`globe` fallback, geo), `bell` (desktop-notification), `play` (autoplay-media), `window` (popup), `trash`, `gear`, `key` (passwords), `extensions` (add-ons), `close`, `check`, `chevron-right`. Permission IDs are the upstream Firefox IDs (`camera`, `microphone`, `geo`, `desktop-notification`, `autoplay-media`, `popup`); display labels come from `CHROME_BAR_COPY` keyed by those IDs, never renamed IDs. Every glyph confirmed by the static gate deriving from `dist/codicon.css`. |
| Font | Delegated: bar/panel text inherits the Theia UI font; `@powerbrowser/*` carries no `font-family` literal. |

Component Inventory and Element-to-Component Binding are omitted (`Tool: none`).

---

## Spacing Scale

Inherited multiples of 4, plus the 12px `md-gap` step. No new tokens.

| Token | Value | Usage in Phase 31 |
|-------|-------|-------------------|
| xs | 4px | identity-box icon gaps; permission-row icon-to-label gap |
| sm | 8px | panel section padding; menu item gap |
| md-gap | 12px | panel row horizontal padding; pill-to-lock gap (inherited) |
| md | 16px | icon slots (16×16); panel width unit |
| lg | 24px | identity-box hit target height; permission toggle height |
| xl | 32px | panel rows; menu rows |
| 2xl | 48px | panel header (connection + host, two lines) |

**Geometry (Decided, autonomous, recommended):**

- **Identity box** (`.pb-identity`, left end of pill, before the mode button when present): 24px tall, `padding: 0 4px`, `gap: 4px`, radius 9999px, transparent fill. Contents in order: security icon (16px) → optional permission icons (12px, max 3 + overflow `+n`) → optional shield (16px) → host text (14px, truncated `max-width: 220px`, ellipsized middle). Click anywhere opens the site panel; `aria-label` = copy `sitePanelOpen` + host.
- **Site panel** (`.pb-chrome-bar-dropdown.pb-site-panel`, anchored at identity box, `top: calc(100% + 4px)`, `width: 320px`, `padding: 4px`): header 48px (state icon 16px + host 14px + base-domain caption 12px); section headings 24px; permission rows 32px (`padding: 0 12px`, `gap: 8px`, icon 16px + label + tri-state control); footer rows 32px. Same `max-height: min(432px, calc(100vh - <top> - 8px))` rule as the result dropdown. Scrolls internally; never grows the page.
- **Hamburger button** (`.pb-chrome-bar-button`, right end of bar after New Tab): 32×32, `codicon-menu` 16px. Menu (`.pb-chrome-bar-dropdown.pb-app-menu`) anchored at button, `width: 280px`, rows 32px `padding: 0 12px`, separators 1px `margin: 4px 0`, access-key underline.
- **Permission icons in box**: 12px glyphs, muted ink; warning colour only for `broken`/`mixed-passive` state icon.

Exceptions: none.

---

## Typography

No new size, no new weight. Three sizes, two weights, inherited.

| Role | Size | Weight | Line Height | Applies to in Phase 31 |
|------|------|--------|-------------|------------------------|
| Body | 14px | 400 | 1.5 | host text; menu item labels; permission labels |
| Label | 13px | 400 | 1.4 | panel section text; permission state text; tooltips |
| Caption | 12px | 400 | 1.5 | base-domain line; cert fields; shield counts; footer hints |

Weight 600 stays reserved for the active menu-toggle segment (none in this phase). Access-key letters underlined, never emboldened.

---

## Color

All values are `--theia-*` variables; no hex literals in `@powerbrowser/*`.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `--theia-editor-background` | panel/menu surface (via dropdown class) |
| Secondary (30%) | `--theia-menu-background` / `--theia-list-hoverBackground` | hover rows; section separators |
| Accent (10%) | `--theia-button-background` | permission "Allow" persist + shield "Turn off" confirm only |
| Destructive | `--theia-errorForeground` / `--theia-button-background` variants | Clear-data confirm only |
| Warning | `--theia-notificationsWarningIcon-foreground` | `broken` / `mixed-passive` state icon |
| Muted ink | `--theia-descriptionForeground` | permission icons, cert captions, shield counts |

Accent reserved for: allow-persist confirm, shield-exception confirm. Destructive reserved for: clear-site-data confirm. Nothing else uses either.

---

## Copywriting Contract

Every string lives in `CHROME_BAR_COPY` (`chrome-bar-copy.ts`); TSX carries no literal. `{App}` = `appSubject()` at render time. No pref key, port, enum value, or principal in copy.

| Element | Copy |
|---------|------|
| Secure pill badge | lock icon only, tooltip `Connection secure` |
| Insecure pill badge | lock-crossed icon + `Not Secure` text before host |
| Warning pill badge | warning-triangle icon, tooltip `This page has a security problem` |
| Local pill badge | no icon; host shown (e.g. `localhost`) |
| Editor (non-web) tab | no indicator at all |
| Site panel header (secure) | `Connection secure` + host + base domain |
| Site panel header (insecure) | `Connection not secure` + host |
| Site panel cert block | `Certificate` heading; rows `Issued to: {name}`, `Issued by: {name}`, `Valid: {dates}`; no file path |
| Permission row states | `Allowed` / `Blocked` / `Use default` (tri-state; click cycles Allow → Block → Default). `autoplay-media` is the exception: `Allowed` / `Block sounds` / `Block all` / `Use default` (cycles Allow → Block sounds → Block all → Default), because upstream exposes `ALLOW`, `BLOCK`, `AUTOPLAY_BLOCKED_ALL` (`SitePermissions.sys.mjs:888-892`) |
| Permission controls aria | `{permission} for {host}: {state}` |
| Clear-data row | `Clear cookies and site data…`; confirm dialog `Clear data for {host}?` + `You stay signed in to {App}.` + buttons `Clear` / `Cancel` |
| Shield row (clean) | `No trackers detected on this page` |
| Shield row (blocked) | `{n} trackers blocked` + toggle `Turn off protection for this site` / `Turn protection back on` |
| Hamburger entries | Firefox order, filtered: `New Tab`, `New Window` (if landed), `History`, `Downloads` (disabled until Phase 32 — shows `Coming soon` caption, not a dead click), separator, `Settings`, `Passwords`, `Add-ons`, separator, `Help` (opens `support` stock page), separator, `Quit {App}` with `Ctrl+Q` badge (sends the `quitRequest` store kind → chrome `quitApplication()`; Ctrl+Q is a chrome-reserved `<key>` in `powerbrowser.js`, no Theia keybinding) |
| Quit confirm | none — quit is immediate per Firefox (cancel only via page leave-prompt observer) |
| Empty permissions | `No special permissions set for this site` |
| Load failure | `Site information is not available for this page.` + next step `Try reloading the page.` |

---

## UI Considerations

Applicable state considerations resolved: 9 covered, 2 backstop, 0 unresolved.

| Category | Element(s) | Status | Resolution / Reason |
|----------|------------|--------|---------------------|
| empty | permission list (all default) | ✅ covered | Empty copy row renders, never a blank section |
| empty | shield (zero blocked) | ✅ covered | Clean copy row renders with shield icon |
| empty | non-web tab (editor/terminal) | ✅ covered | No identity box element at all (truth, gated) |
| loading | panel while `webTabSiteInfo` in flight | ✅ covered | Shimmer rows (150ms rule from Phase 30) then content |
| error | `unknown-tab` / refused reply | ✅ covered | Load-failure copy + reload next step |
| populated | permission icons in box | ✅ covered | Up to 3 icons + `+n` overflow, tooltip lists all |
| zero-one-many | shield counts 0/1/n | ✅ covered | Singular `1 tracker blocked` vs plural row |
| long-text | host / cert names | ✅ covered | Host ellipsizes middle at 220px; cert rows wrap at 2 lines max |
| overflow | panel on short window | ✅ covered | Internal scroll under the 432px cap, page never shifts |
| partial | cert on insecure/local | 🧪 backstop | Cert block hidden; held-out visual check that no gap remains |
| long-text | IDN spoofable | 🧪 backstop | Punycode shown; visual check against Firefox chrome |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not required |
| third-party | none | not required |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS
- [ ] Dimension 7 Inventory Provenance: PASS

**Approval:** pending (self-check §6)

---

## Appendix (planning-run contract)

### must_haves
- truths:
  - "Identity box, site panel, shield, and hamburger match the geometry/copy above and inherit 29/30 tokens"
  - "Every SITE/MENU copy string lives in CHROME_BAR_COPY with {App} from appSubject()"
  - "All D-31-09/D-31-10/D-31-14 visual decisions are implemented"
- prohibitions:
  - statement: "MUST NOT introduce a hex colour, font-family literal, or user-facing literal outside CHROME_BAR_COPY"
    verification: backstop
- artifacts:
  - path: ".planning/phases/31-site-identity-permissions-and-app-menu/31-UI-SPEC.md"
    provides: "visual/interaction contract for identity, panel, shield, hamburger"
    contains: "Copywriting Contract"

### threat_model
| ID | Category | Threat | Severity | Disposition |
|----|----------|--------|----------|-------------|
| T-31-U01 | Spoofing | Panel mimics browser chrome to phish | medium | mitigate — panel is a chrome-bar portal, never covers the page; no URL text is editable inside it |
| T-31-U02 | Information disclosure | Cert/punycode confusion leaks trust | low | mitigate — punycode + warning colour rules above; copy gate |

### verify + fails_when
- `<automated>` `grep -c "CHROME_BAR_COPY\|codicon-" .planning/phases/31-site-identity-permissions-and-app-menu/31-UI-SPEC.md` — expect `>=6`
  <fails_when>non-zero exit; count < 6; any hex colour literal `#[0-9a-fA-F]{3,6}` in `@powerbrowser/*` paths named by plans</fails_when>

*Phase: 31-site-identity-permissions-and-app-menu*
