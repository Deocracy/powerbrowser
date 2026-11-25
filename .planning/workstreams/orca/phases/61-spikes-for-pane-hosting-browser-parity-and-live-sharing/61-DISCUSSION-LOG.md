# Phase 61: Spikes for pane hosting, browser parity and live sharing - Discussion Log

> **Audit trail only.** Decisions are in CONTEXT.md.

**Date:** 2026-11-09
**Mode:** auto (Chris, 2026-11-09, in the box: "Claude takes the recommended answers, keeps going"). No per-area questions were put to Chris; each P61 decision is Claude's recommended pick, open to override.

## Areas and picks

| Area | Recommended pick (taken) | Alternatives considered |
|---|---|---|
| Pane-hosting route | Same-document mount first, iframe-per-pane second, both measured (P61-01) | iframe only; PB-written Theia widgets over orcad's private RPC (rejected: ARCHITECTURE Q6, no version guarantee) |
| Layout observation | Listener on persisted/session layout state, no Orca layout patch (P61-02) | Patch Orca's layout store (violates D-16 cap) |
| Prototype location | `.planning/spikes/004-…`, built from `orca/` (P61-03) | Tracked scratch extension (would hit the brand probe and the overlay rule) |
| Parity derivation | Tracked `scripts/orca-browser-parity.mjs` deriving from the pinned tree plus a hand-kept disposition table (P61-04) | Hand-written list only (fails the re-run-on-re-pin criterion) |
| Provider seam | `orcad/orcad-browser-provider.ts` kind, one ability proven end to end (P61-05) | Agent-side tool rewrite (touches more Orca files) |
| Live-sharing floor | `claude --resume` of a PB-orcad session, proven without Chris (P61-06); fallback recommendation if share is impossible (P61-07) | Wait for EXT-01 (deferred, D-18) |
| Mechanics | Three Orca lanes, VERDICT lines copied into ROADMAP phases 63/64/66, wrap-up into the spike-findings skill (P61-08..P61-10) | One sequential lane |

## Claude's Discretion

Prototype layout, measurement harness, BiDi commands, CLI invocation.

## Deferred Ideas

Live share with the extension (EXT-01 pass); upstream PRs (Phase 68).
