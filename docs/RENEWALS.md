# Renewals

Every renewable item the release machinery depends on, with its date and the owner action that renews, rotates or confirms it.

The quick row `renewals` checks this file's structure only: every row has a date and an owner action, and no item is named twice. The red-within-30-days check is the maintenance sweep's `renewals-due` row (Phase 48).

Reading the date column: an ISO date is an expiry or a deadline. A bare year, or Month YYYY, is a deadline known only to that precision. Where the tree records no expiry, the date is the day this register last checked the item, and the cell says so. The owner replaces it with the provider's expiry when entering it.

| Item | Date | Owner action | Source |
| --- | --- | --- | --- |
| Google Safe Browsing API key, mounted at `/keys/sb-gapi.data`; keyfile on legion outside the repository | 2026-10-29 (no expiry; rotate on compromise or quota notice) | Rotate the key: obtain a new one in the Google Cloud console, replace the one-line keyfile on legion, then rebuild the release container image. | UPD-29 |
| Domain powerbrowser.org | 2026-10-29 (expiry not recorded in the tree) | Renew the domain at the registrar before it lapses, then set this date to the expiry shown there. | DOC-04 |
| Apple Developer membership | 2026-10-29 (expiry not recorded in the tree) | Renew the membership in the Apple developer account, then set this date to its expiry. | DOC-04 |
| Developer ID certificate | 2026-10-29 (expiry not recorded in the tree) | Re-verify the certificate expiry before Phase I, then renew it. SEC-13 records the Developer ID CA expiry. | SEC-13 |
| Azure Artifact Signing identity validation | 2026-10-29 (expiry not recorded in the tree) | Re-verify the identity validation status before Phase H signs anything, then renew the account term before it ends. | SEC-12 |
| App private keys, powerbrowser-bot and powerbrowser-clock | 2026-10-29 (no expiry; rotate on compromise) | Rotate each App private key in its App settings, then replace the copy in each environment secret. No App key lives on legion. | GH-10, DIST-08 |
| Cachix token | 2026-10-29 (expiry not recorded in the tree) | Rotate the Cachix token in the cache settings, then replace the repository secret that holds it. | INF-05 |
| Cloudflare wrangler deploy token, scheduler and telemetry repositories | 2026-10-29 (expiry not recorded in the tree) | Rotate the token in the Cloudflare dashboard, then replace the secret in those two repositories only. | INF-06 |
| Cloudflare R2 object-write token, MAR download bucket (primary origin) | 2026-10-29 (expiry not recorded in the tree) | Rotate the token in the Cloudflare dashboard, then replace the release environment secret that holds it. | INF-06, DIST-08 |
| Telemetry route shared secret, bot environment and Worker | 2026-10-29 (no expiry; rotate on compromise) | Rotate the secret, then replace it in the bot environment and in the telemetry Worker together. | TEL-11 |
| Codeberg deploy token, legion mirror | 2026-10-29 (expiry not recorded in the tree) | Rotate the token on legion, then re-verify that the mirror push succeeds. | GH-04 |
| Anthropic key, fixer | 2026-10-29 (expiry not recorded in the tree) | Rotate the key in the Anthropic Console, then replace the fixer environment secret. | FIX-08 |
| Anthropic key, triage | 2026-10-29 (expiry not recorded in the tree) | Rotate the key in its own Anthropic Console workspace, then replace the triage environment secret. | GH-03, GH-16 |
| winget submission credential | 2026-10-29 (holder not yet decided) | Decide the credential holder in Phase J, then record its expiry in this cell and rotate it on that date. | DIST-04, DIST-12 |
| MAR signing certificate | 2046 | Confirm the expiry at the Phase B secondary-key ceremony, then replace this year with the ISO date. | SEC-09, DOC-04 |
| Node 24 end of life | 2028-04-30 | Decide the successor Node line before this date. | UPS-02 |
| ESR 153 final point release 153.27 | 2027-09-07 | Ship PowerBrowser 175.x before this date. | UPS-01 |
| ESR 175 train dates: nightly, beta, release | 2027-05-27 nightly; 2027-06-10 beta; 2027-06-29 release | Check the dates against the Mozilla ESR calendar before each train opens. The fixer must be proven before 2027-05-27 (FIX-10). | UPS-01, FIX-10 |
