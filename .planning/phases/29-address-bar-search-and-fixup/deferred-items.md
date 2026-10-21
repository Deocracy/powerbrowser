# Phase 29 deferred items

## From 29-08

- **one-off scenario, Enter on the highlighted one-off: intermittent.** In 29-08, `verify-address-bar-live.mjs` failed `one-off` with "no GET on /two/search with q "hello" after Enter on the highlighted one-off" in 2 of 12 runs: once in the full run and once in `--scenario search,one-off`. The other 10 runs passed, and so did the self-test's clean control (a full run). This step re-requests the URL the tab already shows (`/two/search?q=hello`, loaded by the click step just before it), so a request served without reaching the server is one possible cause. That has not been confirmed. 29-08 does not change this path: the one-off Enter branch, `runOneOff` and `typeInPill` are as 29-06 and 29-07 left them, and untrusted input events never autofill. The failure message now names the requests since the mark, the pill and the one-off strip, so the next red run carries evidence. Not fixed here (out of scope).
