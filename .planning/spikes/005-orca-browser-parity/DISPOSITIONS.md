# Spike 005: Gecko dispositions for every Orca browser ability

One row per `browser.*` RPC name defined by the pinned Orca source. The ability set and the
users column are derived by `scripts/orca-browser-parity.mjs`, which compares this table with
the tree both ways: a row without a derived ability and a derived ability without a row are both red.

- **disposition** (P61-04) names the Gecko mechanism class: `BiDi` (a WebDriver BiDi command module
  does it), `BiDi+` (a BiDi command plus PB code), `actor` (a chrome or content actor PB writes),
  `native` (existing PB or Gecko code, no automation protocol), `impossible` (no mechanism in
  Gecko 153.5.1). It does not decide the transport: D-11 allows no BiDi port in a shipped build, so
  how a BiDi module is reached in process is question 4 of the README.
- **users** is derived, never typed: `agent` and `CLI` when the quoted name appears under Orca's
  `src/cli/`, `renderer` under `src/renderer/`, `orcad` under `src/main/orcad/`, `main` under
  `src/main/browser/` (the desktop client host). `none` means no caller in those four trees: the
  name is reached through a shared constant or by the mobile relay.
- **tier** follows research/FEATURES.md A.5: 1 agents can work in PB tabs, 2 later, 3 not planned.
- **[ASSUMED]** marks a row whose mechanism no run has shown (assumption A10). The cite in
  brackets is the FEATURES.md row the guess came from.

| ability | users | disposition | Gecko mechanism | tier | note |
|---|---|---|---|---|---|
| browser.back | CLI, agent, main, renderer | native | PowerBrowserAPI.webTabBack / webTabForward / webTabReload | 1 | [ASSUMED] methods exist in the tree; not run through the seam (A1-01) |
| browser.capture.start | CLI, agent | BiDi | log.entryAdded, network.* events, network.addDataCollector/getData | 1 | [ASSUMED] A1-11 |
| browser.capture.stop | CLI, agent | BiDi | log.entryAdded, network.* events, network.addDataCollector/getData | 1 | [ASSUMED] A1-11 |
| browser.certificate.proceed | orcad, renderer | native | Gecko certificate error override | 2 | [ASSUMED] A1-24 |
| browser.check | CLI, agent | BiDi+ | script.callFunction sets the value and dispatches input/change | 1 | [ASSUMED] A1-07 |
| browser.clear | CLI, agent | BiDi+ | script.callFunction sets the value and dispatches input/change | 1 | [ASSUMED] A1-07 |
| browser.click | CLI, agent | BiDi | input.performActions pointer and wheel sources | 1 | [ASSUMED] focus on a background tab and DPR alignment unproven (A1-05, Q3) |
| browser.clientHost.attach | main | native | none in Gecko: S2 seam protocol called by the PB runtime client | 1 | shown by provider-proof.mjs on 2026-11-09: attach accepted from a PB runtime client with no Orca patch (Q1) |
| browser.clientHost.commandResult | main | native | none in Gecko: S2 seam protocol called by the PB runtime client | 1 | shown by provider-proof.mjs on 2026-11-09: results for createPage and goto were acknowledged (Q1) |
| browser.clientHost.fileChannel.abort | main | native | none in Gecko: S2 file transport called by the PB runtime client | 2 | [ASSUMED] carries upload and download bytes |
| browser.clientHost.fileChannel.read | main | native | none in Gecko: S2 file transport called by the PB runtime client | 2 | [ASSUMED] carries upload and download bytes |
| browser.clientHost.fileChannel.write | main | native | none in Gecko: S2 file transport called by the PB runtime client | 2 | [ASSUMED] carries upload and download bytes |
| browser.clientHost.pageMetadata | none | native | none in Gecko: S2 seam protocol called by the PB runtime client | 1 | [ASSUMED] not called by the proof; carries title and URL changes the page makes without a command |
| browser.clipboardRead | CLI, agent | native | chrome clipboard service behind PowerBrowserAPI | 2 | [ASSUMED] not in BiDi; actor is the alternative (A1-15) |
| browser.clipboardWrite | CLI, agent | native | chrome clipboard service behind PowerBrowserAPI | 2 | [ASSUMED] not in BiDi; actor is the alternative (A1-15) |
| browser.console | CLI, agent | BiDi | log.entryAdded, network.* events, network.addDataCollector/getData | 1 | [ASSUMED] A1-11 |
| browser.cookie.delete | CLI, agent | BiDi | storage.getCookies / setCookie / deleteCookies | 1 | [ASSUMED] A1-13 |
| browser.cookie.get | CLI, agent | BiDi | storage.getCookies / setCookie / deleteCookies | 1 | [ASSUMED] A1-13 |
| browser.cookie.set | CLI, agent | BiDi | storage.getCookies / setCookie / deleteCookies | 1 | [ASSUMED] A1-13 |
| browser.dblclick | CLI, agent | BiDi | input.performActions pointer and wheel sources | 1 | [ASSUMED] focus on a background tab and DPR alignment unproven (A1-05, Q3) |
| browser.dialogAccept | CLI, agent | BiDi | browsingContext.handleUserPrompt | 1 | [ASSUMED] TabManager returned null for overlays in spike 002c; may become actor (A1-16, Q5) |
| browser.dialogDismiss | CLI, agent | BiDi | browsingContext.handleUserPrompt | 1 | [ASSUMED] TabManager returned null for overlays in spike 002c; may become actor (A1-16, Q5) |
| browser.download | CLI, agent | BiDi | browsingContext.downloadWillBegin/downloadEnd plus browser.setDownloadBehavior | 2 | [ASSUMED] A1-17 |
| browser.drag | CLI, agent | BiDi | input.performActions pointer and wheel sources | 1 | [ASSUMED] focus on a background tab and DPR alignment unproven (A1-05, Q3) |
| browser.eval | CLI, agent, renderer | BiDi | script.evaluate | 1 | script DOM reads on a PB web tab were shown by spike 003 (A1-09) |
| browser.exec | CLI, agent | impossible | none: the vocabulary belongs to the CDP-only agent-browser binary | 1 (subset) | a documented subset (read, get, is) can be served as BiDi+; everything else answers browser_command_unavailable (A1-09) |
| browser.fill | CLI, agent | BiDi+ | script.callFunction sets the value and dispatches input/change | 1 | [ASSUMED] A1-07 |
| browser.find | CLI, agent, main, renderer | BiDi+ | browsingContext.locateNodes (accessibility, innerText) plus the action | 2 | [ASSUMED] partial locator coverage (A1-10) |
| browser.focus | CLI, agent | BiDi+ | script.callFunction sets the value and dispatches input/change | 1 | [ASSUMED] A1-07 |
| browser.forward | CLI, agent, main, renderer | native | PowerBrowserAPI.webTabBack / webTabForward / webTabReload | 1 | [ASSUMED] methods exist in the tree; not run through the seam (A1-01) |
| browser.fullScreenshot | CLI, agent | BiDi | browsingContext.captureScreenshot origin document | 1 | [ASSUMED] A1-04 |
| browser.geolocation | CLI, agent, orcad | BiDi | emulation.setGeolocationOverride | 2 | [ASSUMED] A1-19 |
| browser.get | CLI, agent | BiDi+ | script.callFunction | 2 | [ASSUMED] A1-10 |
| browser.goto | CLI, agent, main, renderer | native | PowerBrowserAPI.webTabNavigate, result from the PowerBrowserWebTabState push | 1 | shown end to end by provider-proof.mjs on 2026-11-09: Orca CLI goto through orcad and the S2 host to a PB web tab, result {url, title} (A1-01) |
| browser.highlight | CLI, agent | actor | overlay drawn by a content actor | 2 | [ASSUMED] A1-10 |
| browser.hover | CLI, agent | BiDi | input.performActions pointer and wheel sources | 1 | [ASSUMED] focus on a background tab and DPR alignment unproven (A1-05, Q3) |
| browser.identity.get | CLI, agent | BiDi | emulation.setUserAgentOverride | 2 | [ASSUMED] A1-22 |
| browser.identity.set | CLI, agent | BiDi | emulation.setUserAgentOverride | 2 | [ASSUMED] A1-22 |
| browser.intercept.disable | CLI, agent | BiDi | network.addIntercept / removeIntercept / continueRequest | 2 | [ASSUMED] A1-12 |
| browser.intercept.enable | CLI, agent | BiDi | network.addIntercept / removeIntercept / continueRequest | 2 | [ASSUMED] A1-12 |
| browser.intercept.list | CLI, agent | BiDi | network.addIntercept / removeIntercept / continueRequest | 2 | [ASSUMED] A1-12 |
| browser.is | CLI, agent | BiDi+ | script.callFunction | 2 | [ASSUMED] A1-10 |
| browser.keyboardInsertText | CLI, agent, renderer | BiDi+ | script.callFunction text insertion (Gecko has no insert-text command) | 1 | [ASSUMED] A1-06 |
| browser.keypress | CLI, agent, main, renderer | BiDi | input.performActions key source | 1 | key input into a PB web tab was shown by spike 003; focus on a background tab [ASSUMED] (A1-06, Q3) |
| browser.mouseClick | none | BiDi | input.performActions pointer and wheel sources | 1 | [ASSUMED] focus on a background tab and DPR alignment unproven (A1-05, Q3) |
| browser.mouseDown | CLI, agent, renderer | BiDi | input.performActions pointer and wheel sources | 1 | [ASSUMED] focus on a background tab and DPR alignment unproven (A1-05, Q3) |
| browser.mouseMove | CLI, agent, renderer | BiDi | input.performActions pointer and wheel sources | 1 | [ASSUMED] focus on a background tab and DPR alignment unproven (A1-05, Q3) |
| browser.mouseUp | CLI, agent, renderer | BiDi | input.performActions pointer and wheel sources | 1 | [ASSUMED] focus on a background tab and DPR alignment unproven (A1-05, Q3) |
| browser.mouseWheel | CLI, agent, renderer | BiDi | input.performActions pointer and wheel sources | 1 | [ASSUMED] focus on a background tab and DPR alignment unproven (A1-05, Q3) |
| browser.network | CLI, agent | BiDi | log.entryAdded, network.* events, network.addDataCollector/getData | 1 | [ASSUMED] A1-11 |
| browser.openUrl | CLI, agent, orcad | native | WebTabOpenHandler.openUrl | 1 | [ASSUMED] A1-23 |
| browser.pdf | CLI, agent | BiDi | browsingContext.print | 1 | [ASSUMED] A1-04 |
| browser.profileClearDefaultCookies | renderer | native | Firefox import and clear-data | 3 | [ASSUMED] anti-feature, not planned (A1-26) |
| browser.profileClearGoogleCookies | renderer | native | Firefox import and clear-data | 3 | [ASSUMED] anti-feature, not planned (A1-26) |
| browser.profileCreate | CLI, agent, renderer | BiDi+ | browser.createUserContext / getUserContexts / removeUserContext | 3 | [ASSUMED] not planned for v1.7: one PB profile; the external-Chromium provider drops this group too (A1-21) |
| browser.profileDelete | CLI, agent, renderer | BiDi+ | browser.createUserContext / getUserContexts / removeUserContext | 3 | [ASSUMED] not planned for v1.7: one PB profile; the external-Chromium provider drops this group too (A1-21) |
| browser.profileDetectBrowsers | renderer | native | Firefox import and clear-data | 3 | [ASSUMED] anti-feature, not planned (A1-26) |
| browser.profileImportFromBrowser | renderer | native | Firefox import and clear-data | 3 | [ASSUMED] anti-feature, not planned (A1-26) |
| browser.profileList | CLI, agent, renderer | BiDi+ | browser.createUserContext / getUserContexts / removeUserContext | 3 | [ASSUMED] not planned for v1.7: one PB profile; the external-Chromium provider drops this group too (A1-21) |
| browser.reload | CLI, agent, main, renderer | native | PowerBrowserAPI.webTabBack / webTabForward / webTabReload | 1 | [ASSUMED] methods exist in the tree; not run through the seam (A1-01) |
| browser.screencast | renderer | impossible | none in 153.5.1: browsingContext.startScreencast is Firefox 154 | 3 | not needed: used only by the stock remote pane that PB replaces (A1-25) |
| browser.screencast.unsubscribe | none | impossible | none in 153.5.1: browsingContext.startScreencast is Firefox 154 | 3 | not needed: used only by the stock remote pane that PB replaces (A1-25) |
| browser.screenshot | CLI, agent | BiDi | browsingContext.captureScreenshot | 1 | captureScreenshot on a PB web tab was shown by spike 003; --annotate needs BiDi+ and image compose, [ASSUMED] (A1-04) |
| browser.scroll | CLI, agent | BiDi | input.performActions pointer and wheel sources | 1 | [ASSUMED] focus on a background tab and DPR alignment unproven (A1-05, Q3) |
| browser.scrollIntoView | CLI, agent | BiDi+ | script.callFunction scrollIntoView | 1 | [ASSUMED] A1-05 |
| browser.select | CLI, agent | BiDi+ | script.callFunction sets the value and dispatches input/change | 1 | [ASSUMED] A1-07 |
| browser.selectAll | CLI, agent | BiDi+ | script.callFunction sets the value and dispatches input/change | 1 | [ASSUMED] A1-07 |
| browser.setCredentials | CLI, agent | BiDi | network.continueWithAuth on network.authRequired | 2 | [ASSUMED] A1-19 |
| browser.setDevice | CLI, agent | BiDi+ | setViewport plus emulation.setUserAgentOverride | 2 | [ASSUMED] touch emulation is absent in 153.5.1 (A1-18) |
| browser.setHeaders | CLI, agent | BiDi | network.setExtraHeaders | 2 | [ASSUMED] A1-19 |
| browser.setMedia | CLI, agent | actor | media-feature override from chrome or a content actor | 2 | [ASSUMED] emulation.setMediaFeaturesOverride is Firefox 159, absent in 153.5.1 (A1-19) |
| browser.setOffline | CLI, agent | BiDi | emulation.setNetworkConditions | 2 | [ASSUMED] A1-19 |
| browser.snapshot | CLI, agent | actor | content actor that builds the accessibility tree and binds @eN refs | 1 | [ASSUMED] no accessibility-tree command in Gecko 153.5.1; largest single piece (A1-03, Q2) |
| browser.storage.local.clear | CLI, agent | BiDi+ | script.callFunction on localStorage / sessionStorage | 2 | [ASSUMED] A1-14 |
| browser.storage.local.get | CLI, agent | BiDi+ | script.callFunction on localStorage / sessionStorage | 2 | [ASSUMED] A1-14 |
| browser.storage.local.set | CLI, agent | BiDi+ | script.callFunction on localStorage / sessionStorage | 2 | [ASSUMED] A1-14 |
| browser.storage.session.clear | CLI, agent | BiDi+ | script.callFunction on localStorage / sessionStorage | 2 | [ASSUMED] A1-14 |
| browser.storage.session.get | CLI, agent | BiDi+ | script.callFunction on localStorage / sessionStorage | 2 | [ASSUMED] A1-14 |
| browser.storage.session.set | CLI, agent | BiDi+ | script.callFunction on localStorage / sessionStorage | 2 | [ASSUMED] A1-14 |
| browser.tabClose | CLI, agent, renderer | native | PB-owned table browserPageId to web tab widget (WebTabOpenHandler, TabUriRegistry) | 1 | [ASSUMED] the id cannot live in the tab URI (A1-20) |
| browser.tabCreate | CLI, agent, main, renderer | native | PB-owned table browserPageId to web tab widget (WebTabOpenHandler, TabUriRegistry) | 1 | [ASSUMED] the id cannot live in the tab URI (A1-20) |
| browser.tabCurrent | CLI, agent | native | PB-owned table browserPageId to web tab widget (WebTabOpenHandler, TabUriRegistry) | 1 | [ASSUMED] the id cannot live in the tab URI (A1-20) |
| browser.tabList | CLI, agent | native | PB-owned table browserPageId to web tab widget (WebTabOpenHandler, TabUriRegistry) | 1 | [ASSUMED] the id cannot live in the tab URI (A1-20) |
| browser.tabProfileClone | CLI, agent | BiDi+ | browser.createUserContext / getUserContexts / removeUserContext | 3 | [ASSUMED] not planned for v1.7: one PB profile; the external-Chromium provider drops this group too (A1-21) |
| browser.tabProfileShow | CLI, agent | BiDi+ | browser.createUserContext / getUserContexts / removeUserContext | 3 | [ASSUMED] not planned for v1.7: one PB profile; the external-Chromium provider drops this group too (A1-21) |
| browser.tabSetProfile | CLI, agent | BiDi+ | browser.createUserContext / getUserContexts / removeUserContext | 3 | [ASSUMED] not planned for v1.7: one PB profile; the external-Chromium provider drops this group too (A1-21) |
| browser.tabShow | CLI, agent, orcad, renderer | native | PB-owned table browserPageId to web tab widget (WebTabOpenHandler, TabUriRegistry) | 1 | [ASSUMED] the id cannot live in the tab URI (A1-20) |
| browser.tabSwitch | CLI, agent | native | PB-owned table browserPageId to web tab widget (WebTabOpenHandler, TabUriRegistry) | 1 | [ASSUMED] the id cannot live in the tab URI (A1-20) |
| browser.type | CLI, agent | BiDi | input.performActions key source | 1 | key input into a PB web tab was shown by spike 003; focus on a background tab [ASSUMED] (A1-06, Q3) |
| browser.upload | CLI, agent, main | BiDi | input.setFiles; picker case from input.fileDialogOpened | 2 | [ASSUMED] A1-08 |
| browser.viewport | CLI, agent, orcad | BiDi | browsingContext.setViewport | 2 | [ASSUMED] may conflict with the overlay geometry PB owns (A1-18) |
| browser.wait | CLI, agent | BiDi+ | script.callFunction polling; network idle from network.* events | 1 | [ASSUMED] A1-02 |
