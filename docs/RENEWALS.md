# Renewals

Every renewable item in this project with its date and owner action. Phase 42
(DOC-04) owns this ledger's full shape; Phase 45 adds the first row (the Safe
Browsing key, UPD-29) and notes the coordination assumption below. If Phase 42
lands a fuller file first, these rows merge into it chronologically with the
key name as the stable key.

| Item | Date / cadence | Owner action |
|---|---|---|
| Google Safe Browsing API key (`/keys/sb-gapi.data` mount; keyfile on legion outside the repo) | No expiry; rotate on compromise or quota notice | Re-obtain in the Google Cloud console, replace the one-line keyfile on legion, rebuild the release container image |

## Cloudflare credentials

Tokens renew on their own dates, not on releases, so this block carries no per-release
heading. Every row names exactly one holder. The columns follow the secrets inventory in
`docs/RELEASING.md`.

| Scope | Name | Arrives in | Holder | Renewal date / cadence | Owner action |
|---|---|---|---|---|---|
| Cloudflare account | Account login with 2FA | Not a token; the account owner's login | Owner (Christopher Colantuono) | Re-check 2FA at each renewal | Confirm 2FA is enabled before minting any token below |
| Wrangler deploy token | `CLOUDFLARE_API_TOKEN` (wrangler deploy) | Repository Actions secrets of the scheduler and telemetry repositories only | Owner (Christopher Colantuono) | Set when minted; not yet minted | Mint with the least Pages and Workers permissions for those two repositories; record the expiry date here |
| R2 object-write token | Name set when minted (Phase 49 DIST-08) | `release` environment secret of this repository only, used by the `sign-publish` job | Owner (Christopher Colantuono) | Set when minted; not yet minted (R2 enablement is an owner action) | Enable R2, then mint a token scoped to the MAR bucket that serves `downloads.powerbrowser.org` only; the R2 bucket is the primary MAR origin (owner ruling 2026-10-29). Record the expiry date here |
| Maintenance sweep | None | None; the sweep holds no Cloudflare token | Not applicable: no credential | Not applicable | None. It writes download counts through the telemetry Worker (TEL-11). A workflow that references a Cloudflare secret is a finding to fix before merge |
