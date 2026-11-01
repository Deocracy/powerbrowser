# Windows distribution

This is the tracked copy of what the PowerBrowser download page tells a Windows user. The download page
source is `website-staging/download.html`, and the published page is the `download.html` path of the
homepage that `configuration.toml` `[urls] homepage` names.

## Unsigned-first warning (SEC-03)

The first Windows release ships without an Authenticode signature, and the maintenance service is
disabled (see `docs/RELEASING.md`, "Current posture, honestly", Windows). Until the release is signed,
the download page carries this block word for word:

> Windows may show a 'Windows protected your PC' warning when you open the PowerBrowser installer, because this release is not yet code-signed. Check the download against SHA256SUMS, then choose More info and Run anyway.

The block is the SEC-03 text in `.planning/workstreams/deploy/REQUIREMENTS.md`. The quoted dialog
title is the one the `pkg-win11` guest observes when the installer opens: the matrix record
`scripts/matrix/win-matrix-record.json` carries it in the `launch` cell's `smartscreen` field, written by
the owner's matrix run (`scripts/matrix/win-matrix-run.sh`).

The `win-download-copy` row (`scripts/verify-win-download-copy.mjs`) compares the block in this file,
in `docs/RELEASING.md`, in the download page source and on the published page with the requirement
text, and the dialog title with the matrix record. A paraphrase anywhere is red naming the file. To
change the wording, change the requirement first, then copy the block into every place the row names.

## After signing (SEC-12)

Once the Azure Artifact Signing identity validation is recorded in `docs/RELEASING.md`, the
`sign-windows` job signs the inner program files, then the installer, then produces and signs the
complete update file. The download page then drops the block above and states the signed status;
`win-sign-chain` (`scripts/verify-win-sign-chain.mjs`) goes red on a page that still says unsigned.
