# Refactor brief: R6-tab-uris

Owned: every tracked file under `theia/extensions/tab-uris/`.

Notes:

- The large files are `web-tab.ts` (1,863 lines), `chrome-store-client.ts` (432),
  `profile-storage.ts` (372), `node/tab-store-access-endpoint.ts` (355), `update-client.ts` (306)
  and `node/tab-query-service.ts` (279).
- `TabUriRegistry`'s exported shape is asserted by `scripts/verify-registry-shape.mjs` and stays as
  it is. Every exported name of this extension is imported by other extensions; none is renamed
  or removed.
- `web-tab.ts` is the frontend half of the web-tab overlay: it sends requests over the chrome
  channel (`kind: 'webTabOpen'`, `webTabClose`, `webTabNavigate`, ...) and tracks geometry so the
  chrome overlay follows the widget. The message kinds and their fields are a contract with
  `PowerBrowserAPI.sys.mjs` and do not change. The agent flag handling on open, recreate and reopen
  was fixed in the audit remediation; do not simplify it.
- Look for: geometry reports sent more often than the geometry changes, resize and mutation
  observers that are not disconnected on dispose, requests awaited in sequence that are
  independent, requests sent after dispose, replies applied to a widget whose tab has since
  changed, and maps keyed by tab id that are never pruned.
- `node/` holds the backend endpoints with the token gate in front. Do not change what is
  authenticated or how.
