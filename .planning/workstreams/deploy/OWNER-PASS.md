# v1.6 owner pass: Stage E checklist

Written 2026-11-03 after Stages A-D. Source of truth for the order is FINISH-PLAN.md section 4,
Stage E; rulings R1-R17 and the section 2 defaults are settled. Each step cites the file and line
it was taken from. Line numbers are as of 2026-11-03; search for the quoted text if a line moved.

Conventions used below:

- `R=Deocracy/powerbrowser`, `U=Deocracy/powerbrowser-updates`. Run commands from
  `/home/chris/coding/Power-Browser` (branch `main`) unless a step says otherwise. The plans say
  `/home/chris/gsd-workspaces/deploy/Power-Browser`; that worktree is not used (FINISH-PLAN.md
  section 0).
- `[value: ...]` names the FINISH-PLAN.md section 3 value the step needs. Ask for it at that step.
- "Claude records" means: after you reply, a Claude session runs the plan's post-checkpoint task
  (41-04 T3, 42-04 T3, 48-05 T3, 53-04 T3, and so on) with `--ws deploy`.
- Never paste a key, token, password or recovery-code location into a reply.

## Before you start

- `gh auth status` shows scopes `read:org`, `repo`, `workflow` (checked 2026-11-03). `workflow` is
  needed to push `.github/workflows/*`. `admin:org` is needed only temporarily, for the org reads
  and the runner-group PATCH (41-04-PLAN.md:269-282). Add it with `gh auth refresh -h github.com -s admin:org`
  and remove it with `gh auth refresh -h github.com --remove-scopes admin:org` straight after.
  Labels need `repo` and `read:org`, which you have.
- PID 2169340 is a stale wait loop from another session. Harmless; leave it.
- Check no build runs before any step that touches `upstream/` or `objdir*`:
  `pgrep -af 'mach build'`.
- Firefox ESR 153.6.0 shipped upstream on 2026-10-27, and `main` still pins 153.5.1
  (`configuration.toml:155`, `FIREFOX_153_5_1esr_RELEASE`). This affects R12. Once the scheduler
  ticks, the train can open its own bump PR for 153.6.0 at once, instead of waiting for 153.7 (2026-11-10)
  or 153.8 (2026-11-24). Run the first dispatch with `dry-run=true` (step 3) and read which tag the train
  proposes. If it proposes 153.6.0, the first release is 153.6.0. The 43-05 exit test (a bump PR that
  arrives with no hand dispatch, 43-05-PLAN.md:167) then closes on the first PR the scheduler opens by
  itself, and may be 153.7. N-1 for the hop is an unpublished earlier-buildID tarball of the same ESR built
  on legion (R12).

## Stage B, steps 4-5: move the repository (before any ruleset exists)

Source: FINISH-PLAN.md Stage B steps 4-5; FINISH-SURVEY.md:2386-2389 (the push has to happen before
`ruleset-main-integrity.json` is applied, because that ruleset forbids force pushes and has no bypass actor).

```sh
cd /home/chris/coding/Power-Browser
git fetch deocracy
git merge deocracy/main          # one commit, 9cb73a33, identical content (notify-drill.yml is byte-identical); no force push
git push deocracy main           # 1395 commits ahead of deocracy/main at 2026-11-03
git remote rename origin debios
git remote rename deocracy origin
git remote -v                    # origin must now be https://github.com/Deocracy/powerbrowser.git
```

If the merge prints conflicts, stop and reply; it should not (FINISH-SURVEY.md:2387). Values needed: none.

## 1. GitHub: Apps, controls, variables, secrets (41-04 T2, 42-04 T2, 51)

Values needed: the second owner account login [value: second owner account: HarmonySprings or
stasadance]; `OWNER_LOGIN=ServerDestroyer` (R11).

1. Repositories. `powerbrowser-updates` and `homebrew-tap` already exist live (FINISH-SURVEY.md:2395, 2529).
   If not: `gh repo create Deocracy/powerbrowser-updates --public` and
   `gh repo create Deocracy/homebrew-tap --public`, no README, no licence (41-04-PLAN.md:215-218).
2. Owners and 2FA. The org already has three owners (HarmonySprings, ServerDestroyer, stasadance) and
   2FA required. On each owner account: Settings > Password and authentication > Recovery codes,
   download and store both sets offline; tell no one where (41-04-PLAN.md:220-223).
3. Create the two GitHub Apps, Org Settings > Developer settings > GitHub Apps > New GitHub App
   (41-04-PLAN.md:227-247):
   - `powerbrowser-bot`: homepage `https://github.com/Deocracy/powerbrowser`, webhook unticked, repository
     permissions Contents, Pull requests, Issues read and write; Administration and Dependabot alerts
     read-only; Metadata read-only; everything else, Workflows included, No access. No org or account
     permissions. "Only on this account". Do not generate a private key yet. Install on `powerbrowser`,
     `powerbrowser-updates`, `homebrew-tap` (Only select repositories).
   - `powerbrowser-clock`: same, with repository permissions Actions read and write plus Metadata
     read-only only. Install on `powerbrowser` only.
   - Step 5 of 41-04-PLAN.md (cherry-pick the drill workflow to main) is skipped: `workspace/deploy` is
     merged and `notify-drill.yml` is on both sides.
4. Restrict the `claude` and `slack` Apps (R10): Org Settings > GitHub Apps > each > Configure >
   Repository access > Only select repositories, excluding `powerbrowser`, `powerbrowser-updates` and
   `homebrew-tap`. Claude scoped the check to match (plan 41-05).
5. Apply the declared settings (41-04-PLAN.md:258-263). It needs a terminal:
   ```sh
   node scripts/apply-repo-controls.mjs            # dry run; no BLOCKED line allowed
   node scripts/apply-repo-controls.mjs --yes
   ```
   If an environment PUT fails naming `can_admins_bypass`, stop and reply with the error. If the final PATCH
   fails naming `has_discussions`: `gh repo edit Deocracy/powerbrowser --enable-discussions --enable-auto-merge`.
6. Labels (42-04-PLAN.md:148): run the create-or-update loop and the delete lines that
   `node scripts/apply-repo-controls.mjs` prints. They now include the 19 `state/*` labels
   (`.github/settings/labels.json`, plan 41-06).
7. CodeQL default setup (51 BLOCKED.md:258-259):
   ```sh
   gh api -X PATCH -H 'X-GitHub-Api-Version: 2022-11-28' repos/Deocracy/powerbrowser/code-scanning/default-setup --input .github/settings/code-scanning-default-setup.json
   ```
   Check the languages line of `node scripts/verify-repo-controls.mjs` (51 BLOCKED.md:262).
8. Release-tag refusal probe (41-04-PLAN.md:265-267). Do not create the tag locally:
   ```sh
   git push origin "$(git rev-parse origin/main)":refs/tags/v0.0.0-0     # must be rejected, naming a repository rule
   # if accepted: git push origin :refs/tags/v0.0.0-0, stop and reply
   ```
9. Runner-group and App-list probes (41-04-PLAN.md:269-286), with `admin:org` added:
   ```sh
   gh auth refresh -h github.com -s admin:org
   gh api orgs/Deocracy/actions/runner-groups
   gh api -X PATCH orgs/Deocracy/actions/runner-groups/<default-id> -f name=Default -F restricted_to_workflows=true -F allows_public_repositories=true -f 'selected_workflows[]=Deocracy/powerbrowser/.github/workflows/release.yml@refs/heads/main'
   gh api orgs/Deocracy/actions/runner-groups/<default-id>
   gh api orgs/Deocracy/installations --jq '.installations[] | {app_slug, id, app_id, repository_selection}'
   gh api user/installations/<id>/repositories --jq '[.repositories[].name]'     # each installation id
   gh auth refresh -h github.com --remove-scopes admin:org
   ```
   If a list read is refused, reply DEVICE-FLOW (recommended), FALLBACK or KEEP-RED (41-04-PLAN.md:283-286).
   `claude` and `slack` stay red in `repo-controls` until step 4 is done and their lists are readable.
10. Bot App key and variables. Generate the `powerbrowser-bot` private key once (the App's settings page,
    PKCS#1), then `openssl pkcs8 -topk8 -nocrypt -in <key>.pem -out bot-pkcs8.pem`. Set (docs/RELEASING.md:1069-1073,
    docs/RELEASING.md:283; FINISH-SURVEY.md:2425-2445):
    ```sh
    gh variable set BOT_APP_ID --body '<numeric app id>' --repo Deocracy/powerbrowser
    gh variable set BOT_APP_CLIENT_ID --body '<client id>' --repo Deocracy/powerbrowser
    gh variable set OWNER_LOGIN --body ServerDestroyer --repo Deocracy/powerbrowser
    for E in bot release descriptor; do gh secret set BOT_APP_PRIVATE_KEY --env $E --repo Deocracy/powerbrowser < bot-pkcs8.pem; done
    ```
    Shred both key files afterwards. Also in `powerbrowser-updates` (50 BLOCKED.md item 6, step 1): variable
    `BOT_APP_CLIENT_ID` and secret `BOT_APP_PRIVATE_KEY`.
11. Admission read-back (51 BLOCKED.md:44-46):
    `gh api repos/Deocracy/powerbrowser/actions/permissions/selected-actions` must list `renovatebot/github-action`
    and `anthropics/claude-code-action@db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c`.
12. Notifications (41-04-PLAN.md:288-290): github.com Settings > Notifications > System > Actions: email on, failed
    workflows only. GitHub Mobile: push on for deployment reviews, assignments, direct mentions.
13. Drills from the second owner account (41-04-PLAN.md:292-298) [value: second owner account]:
    ```sh
    gh auth login ; gh auth switch --user <second-login>
    gh issue create -R Deocracy/powerbrowser --assignee ServerDestroyer --title "Notification drill" --body "GH-18 assignment drill"
    gh workflow run notify-drill.yml -R Deocracy/powerbrowser --ref main
    # phone: confirm both pushes, reject the deployment from the phone
    gh issue close <n> -R Deocracy/powerbrowser ; gh auth switch --user ServerDestroyer
    ```
14. Read back: `node scripts/verify-repo-controls.mjs`, then `scripts/verify-platform.sh --only repo-controls`.
    Expected green except the claude/slack lines if their lists could not be read. Reply with the twelve fields of
    41-04-PLAN.md:305-317 and the 42-04 resume signal (42-04-PLAN.md:155). Claude records.

### Stage B, step 6: archive the old repository (only after step 5 above succeeded)

Source: FINISH-PLAN.md Stage B step 6, R8. Do this only after `apply-repo-controls.mjs --yes` succeeded.
```sh
git clone https://github.com/DeBIOS-Foundation/powerbrowser.git /tmp/pb-archive-pointer
cd /tmp/pb-archive-pointer
printf 'This repository moved to https://github.com/Deocracy/powerbrowser\n' > README.md
git add README.md && git commit -m "docs: repository moved to Deocracy/powerbrowser" && git push origin HEAD:main
gh repo archive DeBIOS-Foundation/powerbrowser --yes
```
Other DeBIOS repos and domains are not part of this move (R8).

## 2. Cloudflare and DNS (47-04)

Values needed: Cloudflare payment method [value: payment method, R2]; destination mailbox and a different
sending account [value: mailbox]; postal address [value: postal address, `website-staging/privacy.html:87`].
Source: 47-04-PLAN.md:131-146.

1. Inventory the Namecheap DNS records, mail forwarding and redirects. Keep DNSSEC off during the move.
2. Create the Cloudflare account with 2FA; store recovery codes offline; enable R2 and record whether a payment
   method was asked for.
3. Create `Deocracy/powerbrowser-website` if absent (empty). Move the `powerbrowser.org` nameservers to Cloudflare
   (up to 24 hours).
4. Pages: project `powerbrowser-website` (empty build command, output `/`) on `powerbrowser.org`; project for
   `powerbrowser-updates` on `updates.powerbrowser.org`. Authorise the Cloudflare Pages Git integration for only
   those two repos (FINISH-PLAN.md section 2). Push `website-staging/` to the website repo default branch and the
   staged updates tree to the updates repo.
5. security.txt: Security Settings, enable the feature, Contact `mailto:security@powerbrowser.org`, Expiry about
   11 months out. A RENEWALS row follows (Claude adds it).
6. Email Routing: verify the mailbox; routes for security@, contact@, privacy@; send one test mail to each from a
   different account. Publish the org `.github` repo and SECURITY.md only after the test mails arrive
   (42-04-PLAN.md:146-149): `gh repo create Deocracy/.github --public`, then a PR adding `org-github/SECURITY.md`,
   `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`.
7. Fill the postal address in the staged privacy page, push, then run the probes: four page GETs (`/`, `/download`,
   `/privacy`, `/legal`, 200 and byte-equal to the staged page), the eleven-segment update GET (200) and an unknown
   BUILD_TARGET GET (404); then
   `scripts/verify-platform.sh --only updates-repo-static-self-test`, `--only updates-repo-static`, `--quick`.
8. Reply with the twelve fields (47-04-PLAN.md:145).

The "Open download page" URL in the update copy is changed to `https://powerbrowser.org/download` once this is
live (FINISH-PLAN.md section 2, Phase 46); Claude does that and re-runs `update-copy`.

## 3. Workers and storage

Values needed: Cloudflare account from step 2. No other value.

a. Scheduler (43-05 T2, 43-05-PLAN.md:154-169; wrangler block at docs/RELEASING.md:1954 "Scheduler `wrangler.toml` reference"):
   create `Deocracy/powerbrowser-scheduler` (public, empty), copy the Worker scaffold and the `wrangler.toml` block
   (cron `17 * * * *`, `[[send_email]]` binding `MAIL`, `REPLACE-WITH` values; `REPO_OWNER=Deocracy`). Generate the
   `powerbrowser-clock` key once, convert it with `openssl pkcs8 -topk8 -nocrypt -in <key>.pem -out clock-pkcs8.pem`,
   then (docs/RELEASING.md:1997-2000):
   ```sh
   nix run nixpkgs#wrangler -- --version
   nix run nixpkgs#wrangler -- secret put CLOCK_PRIVATE_KEY < clock-pkcs8.pem
   nix run nixpkgs#wrangler -- deploy
   ```
   Shred the downloaded key. Read the JWT-mint p95 from the Worker log after the first tick; Workers Paid only if it
   exceeds 10 ms [value: payment method]. Then dry-run the train (this decides R12 timing):
   `gh workflow run release-train.yml -R Deocracy/powerbrowser --ref main -f reason=owner -f dry-run=true`.
   Before the first live tracking-issue write, confirm the `state/*` and `release-train` labels exist (step 1.6).
b. Events Worker (48-05 T2, 48-05-PLAN.md:144-171), from `worker/`:
   ```sh
   nix run nixpkgs#wrangler -- --version
   nix run nixpkgs#wrangler -- d1 create powerbrowser-events
   # put the database id in the deployed binding for the deploy command only; never commit it
   nix run nixpkgs#wrangler -- d1 execute powerbrowser-events --file worker/schema.sql
   nix run nixpkgs#wrangler -- secret put DOWNLOAD_COUNT_SECRET
   nix run nixpkgs#wrangler -- deploy
   ```
   Add one rate-limiting rule on the events route, 60 requests per minute per IP, action block (48 BLOCKED.md rulings).
   Probes from outside the account: one synthetic POST to `https://events.powerbrowser.org/events`, one over-cap body
   (413), one burst. Create and pin the issue `release-train: maintenance` in `Deocracy/powerbrowser`. Run
   `scripts/verify-platform.sh --only tel06-error-delivery-live` on the display host. Watchdog (48-05-PLAN.md, items 12-14):
   copy `docs/watchdog.yml` to `Deocracy/powerbrowser-updates/.github/workflows/watchdog.yml`; stop the scheduler cron for
   26 hours, confirm the `release-train has not run in 26 h` issue opens, then re-enable. Record the
   `DOWNLOAD_COUNT_SECRET` holder in `docs/RENEWALS.md`.
c. Crash receiver (57 BLOCKED.md B3, runbook `worker/wrangler-crash.toml`; host `crash.powerbrowser.org`, set by plan 57-07):
   ```sh
   nix run nixpkgs#wrangler -- r2 bucket create powerbrowser-crash-reports
   # apply the 30-day lifecycle rule from worker/crash-r2-lifecycle.json; check flags with: nix run nixpkgs#wrangler -- r2 bucket lifecycle add --help
   # add ONE per-IP block rate-limit rule on path /submit (this comes BEFORE the deploy)
   nix run nixpkgs#wrangler -- deploy --config worker/wrangler-crash.toml
   ```
   Probe: well-formed multipart submit (200 `CrashID=<uuid>`), over-cap (413 `Discarded=oversized_body`), burst (blocked).
   Afterwards Claude states `[urls].crash_report = "https://crash.powerbrowser.org/submit"` and adds the allowlist row.
d. R2 MAR bucket (49-05 T3, 49 BLOCKED.md:231-238): create bucket `powerbrowser-mar`, attach
   `downloads.powerbrowser.org` with public read, r2.dev off. Then:
   ```sh
   gh variable set R2_MAR_BUCKET --env release --body powerbrowser-mar --repo Deocracy/powerbrowser
   gh variable set CLOUDFLARE_ACCOUNT_ID --env release --body '<account id>' --repo Deocracy/powerbrowser
   gh secret set R2_MAR_WRITE_TOKEN --env release --repo Deocracy/powerbrowser     # bucket-scoped object read and write
   ```
   Fill the holder and date on the `Cloudflare R2 object-write token` row of `docs/RENEWALS.md`.
e. Status page and Codeberg mirror (53 BLOCKED.md items 2 and 3, 53-04-PLAN.md:142-174):
   ```sh
   gh api repos/upptime/upptime/generate -f owner=Deocracy -f name=powerbrowser-status --jq .html_url
   # enable Pages; add CNAME status.powerbrowser.org in Cloudflare
   UPPTIME_STATUS_REPO=Deocracy/powerbrowser-status scripts/verify-platform.sh --only upptime-sweep-live
   ```
   Codeberg: create organisation and empty repo `Deocracy/powerbrowser`; make a push-only token; run the root commands
   in 53 BLOCKED.md:34-46 on legion (token file `/etc/codeberg-mirror/mirror-push` mode 0600, bare repo
   `/var/lib/codeberg-mirror/powerbrowser.git`, remotes `origin` and `codeberg`, credential helper). Then
   `gh variable set CODEBERG_MIRROR --body 'Deocracy/powerbrowser' --repo Deocracy/powerbrowser` and
   `CODEBERG_MIRROR=Deocracy/powerbrowser scripts/verify-platform.sh --only codeberg-mirror-live`.
   Delivered (Phase 59 lane 59-02, fb9fbddc): the Codeberg service and timer are in `systemd/legion-pb.nix`, checked
   against legion's 26.05 channel; install it by its header steps (section 5).

## 4. Keys (44-01)

Values needed: whether the two primary `.p12` copies exist [value: primary MAR key offline copies].
Source: 44-01-PLAN.md:119-147; ceremony blocks at docs/RELEASING.md:716-757.

1. Primary copies, only if fewer than two exist (docs/RELEASING.md:728-734):
   ```sh
   PB=/home/chris/gsd-workspaces/deploy/Power-Browser; D=$HOME/.config/powerbrowser-release/mar-key
   $PB/objdir/dist/bin/pk12util -o <medium-1>/powerbrowser-mar.p12 -d "sql:$D" -n powerbrowser-mar -k "$D/password.txt" -w "$D/password.txt"
   $PB/objdir/dist/bin/pk12util -o <medium-2>/powerbrowser-mar.p12 -d "sql:$D" -n powerbrowser-mar -k "$D/password.txt" -w "$D/password.txt"
   ```
2. Secondary ceremony: run the block at docs/RELEASING.md:743-757 verbatim with
   `PB=/home/chris/gsd-workspaces/deploy/Power-Browser` (only that objdir has certutil, pk12util and signmar), `D=$HOME/.config/powerbrowser-release/mar-secondary`,
   nickname `powerbrowser-mar-secondary`, 4096-bit RSA, `-Z SHA384 -v 240`. The export lands in
   `powerbrowser/packaging/mar/mar-secondary.der`. Make two `.p12` copies to two media.
3. Reply with the six fields of 44-01-PLAN.md:147 (DER SHA256, date, machine, both NSS paths, both nicknames, media
   labels). Claude then runs 44-01 Tasks 2 and 3 (regenerate patch 030, add the ng065 fifth case).
4. Release secrets (docs/RELEASING.md:1068-1069), on legion with one medium mounted:
   ```sh
   base64 -w0 <medium>/powerbrowser-mar.p12 | gh secret set MAR_SIGNING_P12_B64 --env release --repo Deocracy/powerbrowser
   gh secret set MAR_SIGNING_P12_PASSWORD --env release --repo Deocracy/powerbrowser < ~/.config/powerbrowser-release/mar-key/password.txt
   gh secret list --env release --repo Deocracy/powerbrowser      # both rows must show today's date
   ```
5. Fill the six lines that 44-04-SUMMARY.md:86-93 names in `docs/RELEASING.md`: primary ceremony date, primary copy
   dates, secondary ceremony and copy dates, the `mar-secondary.der` SHA256, and delete the two stale "until these steps
   run" sentences after Claude finishes 44-01 Tasks 2 and 3. SEC-05 and SEC-09 close with the release; the
   `release.yml` key-selection change is a recorded follow-up (FINISH-PLAN.md section 2).

## 5. legion runner (49-02 T3)

Source: 49 BLOCKED.md:100-150; docs/RELEASING.md:405-460. Needs `repo-controls` green first (step 1).

1. Install the hook as a byte-identical copy and compare:
   ```sh
   pkexec install -D -m 0644 scripts/legion-pre-job-hook.sh /etc/nixos/pb-runner/legion-pre-job-hook.sh
   sha256sum scripts/legion-pre-job-hook.sh /etc/nixos/pb-runner/legion-pre-job-hook.sh    # one hash twice
   ```
2. Add to `/etc/nixos/configuration.nix` (no `.pre-*` backup; git is the backup): the `services.github-runners.powerbrowser-release`
   block from docs/RELEASING.md:405-460, with `url = "https://github.com/Deocracy/powerbrowser"`, `tokenType = "registration"`,
   `ephemeral = false`; `users.users.pb-runner` (`isSystemUser`, `autoSubUidGidRange`, `extraGroups = [ "libvirtd" ]`);
   `users.groups.pb-runner`; `environment.etc."pb-runner/legion-pre-job-hook.sh"`; and the libvirt block from
   54 BLOCKED.md:112-140 (`virtualisation.libvirtd.enable = true; qemu.swtpm.enable = true;` and
   `LIBVIRT_DEFAULT_URI = "qemu:///system";` in `extraEnvironment`).
3. Safe Browsing key directory (FINISH-PLAN.md section 2): add a `systemd.tmpfiles.rules` entry creating
   `/var/lib/powerbrowser-release` as group `pb-runner`, mode 0750, with chris in that group; the file is
   `sb-gapi.data`, mode 0440 (not `sb-gapi.key`, which 45-04-PLAN.md:213 still names). Delivered (Phase 59 lane 59-02,
   fb9fbddc): the rule is in `systemd/legion-pb.nix`. Then
   `gh variable set PB_KEYDIR --body /var/lib/powerbrowser-release --repo Deocracy/powerbrowser`.
4. Prove it evaluates, mint the one-time token, apply:
   ```sh
   pkexec bash -c 'export PATH=/run/current-system/sw/bin:/run/wrappers/bin:$PATH; nixos-rebuild dry-build'
   gh api -H 'X-GitHub-Api-Version: 2022-11-28' -X POST repos/Deocracy/powerbrowser/actions/runners/registration-token --jq .token
   pkexec bash -c 'install -d -m 0700 /var/lib/secrets; printf %s "<token>" > /var/lib/secrets/github-runner-registration; chmod 0600 /var/lib/secrets/github-runner-registration'
   pkexec bash -c 'export PATH=/run/current-system/sw/bin:/run/wrappers/bin:$PATH; nrs "feat: legion non-ephemeral github runner for powerbrowser release builds (SEC-08, SEC-10)"'
   ```
5. Checks: `sudo -u pb-runner test -r /home/chris/.config/powerbrowser-release/mar-key && echo READABLE` and the same for
   `/var/lib/secrets/github-runner-registration` must print nothing. Then
   `gh api repos/Deocracy/powerbrowser/actions/runners --jq '.runners[] | {name, status, labels: [.labels[].name]}'` shows `legion`,
   online, label `powerbrowser-release`. Leave the token file in place.
6. Runner acceptance drill, mandatory before the first release dispatch (docs/RELEASING.md:462-510): throwaway branch
   `drill/hook` carrying `hook-drill.yml`; never push it to `main`.

## 6. Local release build (45-04)

After no other build runs (`pgrep -af 'mach build'`). Source: 45-04-PLAN.md:211-221. Use the key file
`/var/lib/powerbrowser-release/sb-gapi.data` (FINISH-PLAN.md section 2), mounted at `/keys`.
```sh
cd /home/chris/coding/Power-Browser
podman build -t pb-gecko-build -f powerbrowser/packaging/Containerfile .
podman run --rm -v "$PWD:/src:rw" -v /var/lib/powerbrowser-release:/keys:ro -w /src/upstream pb-gecko-build bash -c 'MOZCONFIG=/src/powerbrowser/packaging/mozconfig.release ./mach build && bash /src/scripts/toolchain-baseline.sh --container'
podman run --rm -v "$PWD:/src:rw" -v /var/lib/powerbrowser-release:/keys:ro -w /src pb-gecko-build bash powerbrowser/packaging/package-linux.sh
```
Package-linux now also emits `<tarball base>.complete.mar` (plan 49-06). Then run the five staged rows
(`--only portable-elf`, `sidecar-no-symlinks`, `package-target-natives`, `ng063-packaged-launch`, `packaged-identity`) and
`--only install-matrix`. Copy the toolchain baseline lines into `toolchain-baseline.txt`, record the MAR size, and give Claude the
number to update the website line "about 130 MB (estimated...)" and `docs/BUILD.md` INF-04 rows. Do not paste the key.

## 7. Anthropic (52-05, 53-04 T2)

Values needed: two small monthly spend caps [value: Anthropic caps]. Sources: 52-05-PLAN.md:99-129; 52 BLOCKED.md item 2;
53 BLOCKED.md item 1.

1. Console: workspace `powerbrowser-fixer` with a cap, and a separate triage workspace with its own cap.
2. Fixer credential: create the federation rule for `Deocracy/powerbrowser` (52 BLOCKED.md still says `ServerDestroyer/powerbrowser`,
   which is stale), then
   ```sh
   gh variable set ANTHROPIC_FEDERATION_RULE_ID --body '<rule id>' --repo Deocracy/powerbrowser
   gh variable set ANTHROPIC_ORGANIZATION_ID --body '<org id>' --repo Deocracy/powerbrowser
   ```
   Fallback only if the rule cannot be created: `gh secret set ANTHROPIC_API_KEY --env fixer --repo Deocracy/powerbrowser`.
3. Triage: `gh secret set ANTHROPIC_API_KEY --env triage --repo Deocracy/powerbrowser`.
4. Confirm `@anthropic-ai/claude-code@2.1.314` is the intended package (52 BLOCKED.md item 3). Land `.github/workflows/triage.yml`
   (it is already on `main`; the push in Stage B carries it).
5. Re-run the 52-04 staged drill locally and reply with the date (52-05-PLAN.md item 4). Live proof (FIX-10, item 5) waits for the first
   real red PR in an F2 or F3 class; F1 is owner-resolved (R17).

## 8. Drills (41-04 step 13 above, 53-04 steps 5-6, 48-05)

Values needed: second owner account. From that account (53-04-PLAN.md:142-174): file a private vulnerability report and confirm the
push arrives inside the SECURITY.md window; send a test mail to security@ and confirm the push; open a test issue and confirm the fixed
template comment and labels; open a planted-instruction issue and confirm the only write is the fixed comment and no close. Reply with
the twelve fields of 53-04.

## 9. First Linux release (50-03 T3, 50-04)

Wait for the bump PR (R12; see "Before you start"). Order under R13 differs from 50-04-PLAN.md, which hops before the descriptor.
Source: 50 BLOCKED.md item 6; 50-04-PLAN.md:217-260; docs/RELEASING.md:559-562 (descriptor environment, admin bypass on).

1. Probe prerequisites and run it (50 BLOCKED.md:90-101): `BOT_APP_CLIENT_ID` and `BOT_APP_PRIVATE_KEY` in `powerbrowser-updates`; add
   `docs/withdraw.yml` and `docs/release-probe.yml` there as `.github/workflows/withdraw.yml` and `.github/workflows/release-probe.yml`,
   byte-identical; then
   ```sh
   U="$(gh repo view --json nameWithOwner --jq .nameWithOwner)-updates"
   gh workflow run release-probe.yml --repo "$U"
   gh run watch --repo "$U"
   ```
   Reply with the five `release-probe:` lines. Claude replaces `pending` in the docs/RELEASING.md verdict line. Never delete `probe-1`.
2. Merge the bump PR: `gh pr view <n> --repo Deocracy/powerbrowser --json state,mergeCommit`, then
   `gh pr merge <n> --repo Deocracy/powerbrowser --merge`. Record the merge SHA. The train dispatches `release.yml`; the manual form is
   `gh workflow run release.yml -R Deocracy/powerbrowser --ref main -f sha=<sha>` (FINISH-SURVEY.md:2413).
3. Approve the `release` environment after reviewing the artifact list: `gh run watch --repo Deocracy/powerbrowser --exit-status <run-id>`,
   `gh release view <tag> --repo Deocracy/powerbrowser --json isDraft,assets`.
4. R13: approve the `descriptor` environment with the 24 h wait bypassed (admin bypass is on for that environment), then run the hop drill
   against the live bytes (docs/BUILD.md "Clean-room drill for a published Release", `SIGNMAR` from the source-built signer):
   `node scripts/verify-mar-update-hop.mjs` and `scripts/verify-platform.sh --only mar-update-hop` with `hop.json` served `release`. Your own
   N-1 to N install hop also runs. If the hop fails, run `withdraw.yml` in `powerbrowser-updates` (inputs `tag`, `reason`); never delete a
   Release or tag.
5. `/download` live check, `bash scripts/verify-endpoints.sh --layer 3` host set, and the sweep rows (50-04-PLAN.md:260-300).
6. Reply with the six fields of 50-04-PLAN.md:260. Claude records. FIX-10 and TRAIN-04 live halves stay dated deferrals.

## 10. Nix channel (56-05 T2, Nix half only; Flathub, winget, cask deferred to v1.7, R6)

Source: 56 BLOCKED.md items 1, 2, 6, 7, 13-16. After the first Release has a tarball:
1. Hash record: run the `flake-hash-pr` job or
   `nix store prefetch-file --hash-type sha256 --json https://github.com/Deocracy/powerbrowser/releases/download/<key>/<tarball>`, write `hash`
   into `nix/pkg/release-hash.json`, then `node scripts/verify-flake-repack.mjs --release`.
2. Binary cache: send the Cachix licence request (`docs/cache-flathub-checkpoint.md`, "Cachix licence request"), create the cache, put the
   public key in `nix/cache.json`; or the R2 fallback bucket `powerbrowser-nix-cache` per "R2 fallback enablement" in the same file
   (`nix-store --generate-binary-cache-key` outside the tree). Run `node scripts/verify-binary-cache.mjs --release`. Add `nixConfig` to
   `flake.nix` in the same commit as the real keys, then `nix build .#powerbrowser` on a clean machine.
3. `bot` environment already holds the App key (step 1); confirm the bot App is installed on `homebrew-tap`.

## 11. Windows (54-04 T3; unsigned, R2/R3)

Values needed: Windows 11 ISO and licence, and confirmation of legion disk use [value: Windows media]. (Installer artwork is no longer
needed: deferred to v1.7, A7.) Source: 54 BLOCKED.md items 3, 6, 8, 9, 10; 54-04-PLAN.md:204-212 (steps 1 and Azure are void under R14).

1. ~~Put wizard bitmaps and an `.ico` under `brand/installer/` and sign `brand/HUMAN-REVIEW.md` (54 BLOCKED.md item 3).~~
   Deferred to v1.7 (owner answer A7, 2026-11-04): v1.6 ships the labelled upstream stand-ins; nothing to supply now.
2. libvirt access: done in step 5.2. Fill the OVMF paths in `scripts/matrix/pkg-win11-domain.xml` with the command in 54 BLOCKED.md:150-155.
3. Define the domain (`virsh define scripts/matrix/pkg-win11-domain.xml`), install Windows 11, the QEMU guest agent and stock Firefox, take the
   `clean-baseline` snapshot. Build the `PBMATRIX` inputs ISO and run `PB_MATRIX_ISO=<iso> scripts/matrix/win-matrix-run.sh`; add the `background` cell
   by hand (54 BLOCKED.md:160-170).
4. No `PB_WIN_SIDECAR_SUMS_SHA256` variable is needed: plan 54-05 made the digest a job output.
5. Dispatch `build-windows` (it runs inside `release.yml`); the first `windows-sidecar` run needs its run link recorded in 54-04-SUMMARY.md.
6. Answered 2026-11-04 (A2, option a): Windows publishes to the MAR origin after the Linux publish; plan 54-11 built `publish-windows`,
   `descriptor-windows` and `channel-live-windows`. Descriptor approval for Windows follows your own N-1 to N Windows hop.

## 12. TEL-13 (57-01 T2, 57-04)

After the Windows release. Source: 57 BLOCKED.md B2, B4, B5.
```sh
bash scripts/verify-endpoints.sh --layer 3 --crash-ping                      # must print "crash-ping PASS"
bash scripts/verify-endpoints.sh --layer 3 --crash-ping --positive-control   # must print "positive control PASS ..."
nix develop .#firefox --command ./mach buildsymbols                          # per target, on a reporter-enabled build
```
Plan 57-08 (clear `MOZ_CRASHREPORTER_AUTO_SUBMIT`) landed in Phase 59 lane 59-02 (b03b6b53, d1584703); its live dialog
proof is part of TEL-13 in 59-05. Then the flip is the `CRASH_REPORTER_ENABLED` constant in `scripts/generate.mjs` (WR-09).

## 13. Ledger (R15)

The ledger is frozen to agents. Run these yourself from `/home/chris/coding/Power-Browser`. The script has no `superseded` status
(`STATUS_VALUES` in `scripts/ledger-amend.py:15-16`), and `set-status` cannot write `dropped` or `deferred-approved`
(`scripts/ledger-amend.py:407-409`). The only path that records NG-075 to NG-080 as no longer owed is `drop`, which requires your quoted
words in `--quote`. NG-081 stays `deferred-approved` and needs no command. Replace `<QUOTE>` with your own approval text.

```sh
python3 scripts/ledger-amend.py drop --id NG-075 --reason "Out of scope: MSIX is not built (owner ruling 2026-11-03, R15)" --quote "<QUOTE>"
python3 scripts/ledger-amend.py drop --id NG-076 --reason "Superseded by v1.6 PKG-14, deferred to v1.7 (R4, R15)" --quote "<QUOTE>"
python3 scripts/ledger-amend.py drop --id NG-077 --reason "Superseded by v1.6 MTX-01, UPD-16, UPD-24; the macOS part by PKG-16, deferred to v1.7 (R15)" --quote "<QUOTE>"
python3 scripts/ledger-amend.py drop --id NG-078 --reason "Superseded by v1.6 DIST-02, DIST-07, REL-03 (R15)" --quote "<QUOTE>"
python3 scripts/ledger-amend.py drop --id NG-079 --reason "Superseded by v1.6 DIST-03, DIST-08, UPD-17 (R15)" --quote "<QUOTE>"
python3 scripts/ledger-amend.py drop --id NG-080 --reason "Superseded by v1.6 TEL-07, TEL-09, TEL-13 (R15)" --quote "<QUOTE>"
```
Rows NG-075 to NG-080 are `deferred-approved` today, phase 999.2 (`ledger/REQUIREMENTS.json:968-1044`). NG-081 (per-fixture Gecko builds) stays
`deferred-approved`. Afterwards `python3 scripts/ledger-report.py` and `scripts/verify-platform.sh --quick` must stay green.

## Stage F reminder (not yours): after the last code commit

Rebuild the dev and release objdirs (check `pgrep -af 'mach build'` first), build the N+1 MAR and run `node scripts/drive-mar-update-hop.mjs`
per `docs/BUILD.md` (plan 46-05/06), then `scripts/verify-platform.sh --build` and `--gate`. Before `--gate`, replace the three dead
`GATE_KNOWN_OPEN_EXCLUSIONS` rows with WINDOWS.md-backed exclusions per deferred live row.

## Open values and decisions

Answered 2026-11-04 (settled, do not re-ask): legal name is "Deocracy Institute", `vendor_machine` stays "Deocracy" (A1);
"501(c)(3)-owned" in PROJECT.md holds and the README nonprofit clause is restored (A9); Windows publish path is option (a), the
MAR origin after the Linux publish (A2, plan 54-11); `probe-1` is published as built, never `latest`, never deleted (A3);
Renovate Theia licensing: drop `postUpgradeTasks`, add a release-train job (A4); crash auto-submit by boundary `clearEnv` (A5,
plan 57-08, see below); the Windows registry residue stays and is a known identifier for LEG-01 (A6); installer artwork deferred
to v1.7 (A7); Windows: accept one orphan `node.exe` until reboot and the hash-pinned `vs.tar.zst` toolchain (A8).

Still open for the owner:

Answered 2026-11-04 (A10-A14): fixer pin `@anthropic-ai/claude-code@2.1.314` with claude-code-action `db77d4d3` confirmed (A10);
libvirt, the runner, the Safe Browsing key directory and the Codeberg timer go in one `/etc/nixos` change at step 5 (A11); the
drills run from HarmonySprings (A12); the two primary MAR `.p12` copies do not exist yet and are made at step 4.1 (A13); the monaco
branch `chore/theia-theia-monaco-editor-core` is not regenerated by renovate-licensing until the first live run shows whether its
licensing row goes red (A14, default taken).

Still open: FINISH-PLAN.md section 3 values: postal address for `/privacy`; destination mailbox for Email Routing and a different sending
   account; two Anthropic Console monthly spend caps (fixer, triage); Windows 11 ISO and licence and leave of legion's disk for
   `pkg-win11`; Cloudflare payment method (R2), Workers Paid only if the JWT p95 exceeds 10 ms.

Closed Claude item: plan 57-08 (boundary `clearEnv` for `MOZ_CRASHREPORTER_AUTO_SUBMIT`) landed in Phase 59 lane 59-02
(b03b6b53, d1584703); only its live dialog proof remains (TEL-13, 59-05).
