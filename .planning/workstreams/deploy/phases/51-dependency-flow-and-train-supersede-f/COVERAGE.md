# API Coverage — Phase 51

No external API integration: Phase 51 wires declarative updater configs, desired-state
settings bodies, train state-machine extensions and sweep-row renderers — no external
API/SDK/service is integrated.

GitHub REST is the control plane (settings bodies applied by the owner, read back by
`repo-controls`, sweep rows rendered from API facts), not an integrated product API:
every endpoint touched is declared in a tracked `.github/settings/*.json` body and
compared by projection in `scripts/verify-repo-controls.mjs`, per the GH-02 pattern.
No capability matrix applies.
