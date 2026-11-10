---
id: SEED-261110-preinstalled-extensions
status: planted
target_milestone: after v1.7 Orca integration
planted: 2026-11-10
planted_during: v1.7 Orca integration, phase 68 (ruling 68-A)
trigger_when: the next milestone after v1.7 is being chosen, or any third-party component with its own terms is proposed for the product
scope: Medium, one phase for the generic mechanism plus one plan per component
---

# SEED-261110-preinstalled-extensions: third-party parts with their own terms ship as pre-installed, removable extensions

## Why This Matters

Chris ruled on 2026-11-10 (D-30, ruling 68-A) that the Anthropic Claude agent SDK stays in the
product but moves into an extension: "keep it but make an extension ... we ship with it installed
and they can select or unselect it [and uninstall it], so the terms are on the extension." He
added that the same pattern applies to many components, and named uBlock Origin shipped
pre-installed as a browser WebExtension.

The rule: a third-party component that carries its own terms is not compiled into
PowerBrowser's own code or bundles. It ships as an extension that the product installs for the
user and that the user can disable or remove. The terms then travel with the component, and the
user decides whether to keep it.

## The rule

1. **Pick the host that fits the component.**
   - Sidecar, IDE or agent parts go in a Theia extension (VS Code format), seeded as a user
     plugin, never a built-in. A built-in can be disabled but not uninstalled.
   - Browser parts go in a Gecko WebExtension under `distribution/extensions/`. That installs
     into the profile once with no network, is enabled, can be disabled or removed by the user,
     and a removal sticks. Enterprise-policy `force_installed` and `normal_installed` are never
     used for this rule, because neither lets the user remove the add-on.
2. **Pin the bytes.** Pin by version plus a digest (an npm lockfile integrity, or an XPI sha256).
   Ship the component unmodified, and track no third-party byte in the repository.
3. **Make the terms visible.** The extension carries the component's licence text, and
   THIRD-PARTY-NOTICES.txt lists it in the "Bundled extensions" section, generated from the pins.
4. **Product code tolerates the extension being absent.** Whatever consumes it treats an absent
   or disabled extension as the component's own "not installed" path. Nothing else in the product
   breaks.
5. **Check it.** Each extension has static rows (manifest, pin, licence) with a `--self-test`, and
   a live row under the pb-live lock that proves it is installed, enabled, removable, and that a
   removal sticks across a relaunch.

## Instances so far

- **v1.7, Phase 68, BEXT-01:** the Claude agent SDK, in the Theia extension
  `powerbrowser.claude-agent-sdk` (plans 68-07, 68-09). orcad reads its copy through
  `ORCA_CLAUDE_AGENT_SDK_DIR`.
- **v1.7, Phase 68, BEXT-02:** uBlock Origin, through `distribution/extensions/` (plan 68-08).

## Open for the milestone that takes this seed

- **Generalise only when a second Theia-side component exists.** In v1.7 the Theia side
  (`bundled-extensions/*/`, the `.user` plugins folder, the `@powerbrowser/bundled-extensions`
  seed) and the Gecko side (`powerbrowser/packaging/bundled-xpi.json`) each serve whatever their
  folder or pin file lists. Whether either becomes a `configuration.toml` table that a downstream
  rebrand can restate is a question for that milestone.
- **A reinstall affordance after the user removed a pre-installed extension.** The candidates are
  a "Reinstall bundled extensions" command, or shipping a `.vsix` for Theia's "Install from
  VSIX".
- **Owner review of each component's terms before it ships.** D-30 left the Anthropic terms check
  with the owner, and P68-39 left the GPL-3.0 section 6 source-offer reading with the owner.
- **Candidates to review against the rule.** Any other proprietary or copyleft dependency of
  Orca, Theia or Gecko-side add-ons that is bundled today. The licence derivation of plan 68-04
  lists the shipped closure.
