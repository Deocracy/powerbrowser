# Renewals

Every renewable item the release machinery depends on, with its expiry and the owner action that renews, rotates or confirms it.

The quick row `renewals` checks this file's structure only: every row has an Expiry cell that is a date, a bare year, Month YYYY, blank or `unknown`; a Last checked ISO date; an owner action; and no item is named twice. The red-within-30-days check is the maintenance sweep's `renewals-due` row (Phase 48).

Reading the columns: an ISO date in Expiry is an expiry or a deadline. A bare year, or Month YYYY, is a deadline known only to that precision. A blank Expiry means the item does not expire and is rotated on compromise. `unknown` means the tree does not record the expiry; the owner replaces it with the provider's expiry when entering it. Last checked is the ISO date this register last checked the item.

| Item | Expiry | Last checked | Owner action | Source |
| --- | --- | --- | --- | --- |
| Google Safe Browsing API key, mounted at `/keys/sb-gapi.data`; keyfile on legion outside the repository |  | 2026-10-29 | Rotate the key on compromise or a quota notice: obtain a new one in the Google Cloud console, replace the one-line keyfile on legion, then rebuild the release container image. | UPD-29 |
| Domain powerbrowser.org | unknown | 2026-10-29 | Renew the domain at the registrar before it lapses, then enter the expiry shown there in the Expiry cell. | DOC-04 |
| Apple Developer membership | unknown | 2026-10-29 | Renew the membership in the Apple developer account, then enter its expiry in the Expiry cell. | DOC-04 |
| Developer ID certificate | unknown | 2026-10-29 | Re-verify the certificate expiry before Phase I, then renew it. SEC-13 records the Developer ID CA expiry. | SEC-13 |
| Azure Artifact Signing identity validation | unknown | 2026-10-29 | Re-verify the identity validation status before Phase H signs anything, then renew the account term before it ends. | SEC-12 |
| App private key, powerbrowser-bot |  | 2026-10-29 | Rotate the App private key on compromise in its App settings, then replace the copy in each environment secret that holds it. No App key lives on legion. | GH-10, DIST-08 |
| App private key, powerbrowser-clock |  | 2026-10-29 | Rotate the App private key on compromise in its App settings, then replace the copy in each environment secret that holds it. No App key lives on legion. | GH-10, DIST-08 |
| Cachix token | unknown | 2026-10-29 | Rotate the Cachix token in the cache settings, then replace the repository secret that holds it. | INF-05 |
| Cloudflare account login with 2FA |  | 2026-10-29 | Confirm 2FA is enabled on the Cloudflare account before minting any token below; re-check it at each token renewal. | INF-06 |
| Cloudflare wrangler deploy token, scheduler and telemetry repositories | unknown | 2026-10-29 | Rotate the token in the Cloudflare dashboard, then replace the secret in those two repositories only. | INF-06 |
| Cloudflare R2 object-write token, MAR download bucket (primary origin) | unknown | 2026-10-29 | Rotate the token in the Cloudflare dashboard, then replace the release environment secret that holds it. | INF-06, DIST-08 |
| Telemetry route shared secret, bot environment and Worker |  | 2026-10-29 | Rotate the secret on compromise, then replace it in the bot environment and in the telemetry Worker together. | TEL-11 |
| Codeberg deploy token, legion mirror | unknown | 2026-10-29 | Rotate the token on legion, then re-verify that the mirror push succeeds. | GH-04 |
| Anthropic key, fixer | unknown | 2026-10-29 | Rotate the key in the Anthropic Console, then replace the fixer environment secret. | FIX-08 |
| Anthropic key, triage | unknown | 2026-10-29 | Rotate the key in its own Anthropic Console workspace, then replace the triage environment secret. | GH-03, GH-16 |
| winget submission credential | unknown | 2026-10-29 | Decide the credential holder in Phase J, then enter its expiry in the Expiry cell and rotate it on that date. | DIST-04, DIST-12 |
| MAR signing certificate | 2046 | 2026-10-29 | Confirm the expiry at the Phase B secondary-key ceremony, then replace this year with the ISO date. | SEC-09, DOC-04 |
| Node 24 end of life | 2028-04-30 | 2026-10-29 | Decide the successor Node line before this date. | UPS-02 |
| ESR 153 final point release 153.27 | 2027-09-07 | 2026-10-29 | Ship PowerBrowser 175.x before this date. | UPS-01 |
| ESR 175 nightly train | 2027-05-27 | 2026-10-29 | Check the date against the Mozilla ESR calendar before the train opens. The fixer must be proven before this date (FIX-10). | UPS-01, FIX-10 |
| ESR 175 beta train | 2027-06-10 | 2026-10-29 | Check the date against the Mozilla ESR calendar before the train opens. | UPS-01 |
| ESR 175 release train | 2027-06-29 | 2026-10-29 | Check the date against the Mozilla ESR calendar before the train opens. | UPS-01 |

Every Cloudflare credential has exactly one holder, the owner (Christopher Colantuono). The wrangler deploy token lives only in the scheduler and telemetry repositories' Actions secrets; the R2 object-write token lives only in this repository's `release` environment and is scoped to the bucket that serves `downloads.powerbrowser.org`, the primary MAR origin (owner ruling 2026-10-29). The maintenance sweep holds no Cloudflare token: it writes download counts through the telemetry Worker (TEL-11), and a workflow that references a Cloudflare secret is a finding to fix before merge.
