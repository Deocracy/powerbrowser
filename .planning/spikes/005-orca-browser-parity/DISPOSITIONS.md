# Spike 005: Gecko dispositions for every Orca browser ability

One row per `browser.*` RPC name defined by the pinned Orca source. The ability set and the
users column are derived by `scripts/orca-browser-parity.mjs`, which compares this table with
the tree both ways: a row without a derived ability and a derived ability without a row are both red.

- **disposition** (P61-04) names the Gecko mechanism class: `BiDi` (a WebDriver BiDi command module
  does it), `BiDi+` (a BiDi command plus PB code), `actor` (a chrome or content actor PB writes),
  `native` (existing PB or Gecko code, no automation protocol), `impossible` (no mechanism in
  Gecko 153.5.1). It does not decide the transport: D-11 allows no BiDi port in a shipped build, so
  how a BiDi module is reached in process is question 4 of the README.
- **tier** follows research/FEATURES.md A.5: 1 agents can work in PB tabs, 2 later, 3 not planned.
- **[ASSUMED]** marks a row whose mechanism no run has shown (assumption A10). The cite in
  brackets is the FEATURES.md row the guess came from.

| ability | users | disposition | Gecko mechanism | tier | note |
|---|---|---|---|---|---|
| browser.back |  | native | PowerBrowserAPI.webTabBack / webTabForward / webTabReload | 1 | [ASSUMED] methods exist in the tree; not run through the seam (A1-01) |
| browser.capture.start |  | BiDi | log.entryAdded, network.* events, network.addDataCollector/getData | 1 | [ASSUMED] A1-11 |
| browser.capture.stop |  | BiDi | log.entryAdded, network.* events, network.addDataCollector/getData | 1 | [ASSUMED] A1-11 |
| browser.certificate.proceed |  | native | Gecko certificate error override | 2 | [ASSUMED] A1-24 |
| browser.check |  | BiDi+ | script.callFunction sets the value and dispatches input/change | 1 | [ASSUMED] A1-07 |
| browser.clear |  | BiDi+ | script.callFunction sets the value and dispatches input/change | 1 | [ASSUMED] A1-07 |
| browser.click |  | BiDi | input.performActions pointer and wheel sources | 1 | [ASSUMED] focus on a background tab and DPR alignment unproven (A1-05, Q3) |
| browser.clientHost.attach |  | native | none in Gecko: S2 seam protocol called by the PB runtime client | 1 | [ASSUMED] until provider-proof.mjs has run (Q1) |
| browser.clientHost.commandResult |  | native | none in Gecko: S2 seam protocol called by the PB runtime client | 1 | [ASSUMED] until provider-proof.mjs has run (Q1) |
| browser.clientHost.fileChannel.abort |  | native | none in Gecko: S2 file transport called by the PB runtime client | 2 | [ASSUMED] carries upload and download bytes |
| browser.clientHost.fileChannel.read |  | native | none in Gecko: S2 file transport called by the PB runtime client | 2 | [ASSUMED] carries upload and download bytes |
| browser.clientHost.fileChannel.write |  | native | none in Gecko: S2 file transport called by the PB runtime client | 2 | [ASSUMED] carries upload and download bytes |
| browser.clientHost.pageMetadata |  | native | none in Gecko: S2 seam protocol called by the PB runtime client | 1 | [ASSUMED] until provider-proof.mjs has run (Q1) |
| browser.clipboardRead |  | native | chrome clipboard service behind PowerBrowserAPI | 2 | [ASSUMED] not in BiDi; actor is the alternative (A1-15) |
| browser.clipboardWrite |  | native | chrome clipboard service behind PowerBrowserAPI | 2 | [ASSUMED] not in BiDi; actor is the alternative (A1-15) |
| browser.console |  | BiDi | log.entryAdded, network.* events, network.addDataCollector/getData | 1 | [ASSUMED] A1-11 |
| browser.cookie.delete |  | BiDi | storage.getCookies / setCookie / deleteCookies | 1 | [ASSUMED] A1-13 |
| browser.cookie.get |  | BiDi | storage.getCookies / setCookie / deleteCookies | 1 | [ASSUMED] A1-13 |
| browser.cookie.set |  | BiDi | storage.getCookies / setCookie / deleteCookies | 1 | [ASSUMED] A1-13 |
| browser.dblclick |  | BiDi | input.performActions pointer and wheel sources | 1 | [ASSUMED] focus on a background tab and DPR alignment unproven (A1-05, Q3) |
| browser.dialogAccept |  | BiDi | browsingContext.handleUserPrompt | 1 | [ASSUMED] TabManager returned null for overlays in spike 002c; may become actor (A1-16, Q5) |
| browser.dialogDismiss |  | BiDi | browsingContext.handleUserPrompt | 1 | [ASSUMED] TabManager returned null for overlays in spike 002c; may become actor (A1-16, Q5) |
| browser.download |  | BiDi | browsingContext.downloadWillBegin/downloadEnd plus browser.setDownloadBehavior | 2 | [ASSUMED] A1-17 |
| browser.drag |  | BiDi | input.performActions pointer and wheel sources | 1 | [ASSUMED] focus on a background tab and DPR alignment unproven (A1-05, Q3) |
| browser.eval |  | BiDi | script.evaluate | 1 | script DOM reads on a PB web tab were shown by spike 003 (A1-09) |
| browser.exec |  | impossible | none: the vocabulary belongs to the CDP-only agent-browser binary | 1 (subset) | a documented subset (read, get, is) can be served as BiDi+; everything else answers browser_command_unavailable (A1-09) |
| browser.fill |  | BiDi+ | script.callFunction sets the value and dispatches input/change | 1 | [ASSUMED] A1-07 |
| browser.find |  | BiDi+ | browsingContext.locateNodes (accessibility, innerText) plus the action | 2 | [ASSUMED] partial locator coverage (A1-10) |
| browser.focus |  | BiDi+ | script.callFunction sets the value and dispatches input/change | 1 | [ASSUMED] A1-07 |
| browser.forward |  | native | PowerBrowserAPI.webTabBack / webTabForward / webTabReload | 1 | [ASSUMED] methods exist in the tree; not run through the seam (A1-01) |
| browser.fullScreenshot |  | BiDi | browsingContext.captureScreenshot origin document | 1 | [ASSUMED] A1-04 |
| browser.geolocation |  | BiDi | emulation.setGeolocationOverride | 2 | [ASSUMED] A1-19 |
| browser.get |  | BiDi+ | script.callFunction | 2 | [ASSUMED] A1-10 |
| browser.goto |  | native | PowerBrowserAPI.webTabNavigate, result from the PowerBrowserWebTabState push | 1 | [ASSUMED] until provider-proof.mjs has run (A1-01) |
| browser.highlight |  | actor | overlay drawn by a content actor | 2 | [ASSUMED] A1-10 |
| browser.hover |  | BiDi | input.performActions pointer and wheel sources | 1 | [ASSUMED] focus on a background tab and DPR alignment unproven (A1-05, Q3) |
| browser.identity.get |  | BiDi | emulation.setUserAgentOverride | 2 | [ASSUMED] A1-22 |
| browser.identity.set |  | BiDi | emulation.setUserAgentOverride | 2 | [ASSUMED] A1-22 |
| browser.intercept.disable |  | BiDi | network.addIntercept / removeIntercept / continueRequest | 2 | [ASSUMED] A1-12 |
| browser.intercept.enable |  | BiDi | network.addIntercept / removeIntercept / continueRequest | 2 | [ASSUMED] A1-12 |
| browser.intercept.list |  | BiDi | network.addIntercept / removeIntercept / continueRequest | 2 | [ASSUMED] A1-12 |
| browser.is |  | BiDi+ | script.callFunction | 2 | [ASSUMED] A1-10 |
| browser.keyboardInsertText |  | BiDi+ | script.callFunction text insertion (Gecko has no insert-text command) | 1 | [ASSUMED] A1-06 |
| browser.keypress |  | BiDi | input.performActions key source | 1 | key input into a PB web tab was shown by spike 003; focus on a background tab [ASSUMED] (A1-06, Q3) |
| browser.mouseClick |  | BiDi | input.performActions pointer and wheel sources | 1 | [ASSUMED] focus on a background tab and DPR alignment unproven (A1-05, Q3) |
| browser.mouseDown |  | BiDi | input.performActions pointer and wheel sources | 1 | [ASSUMED] focus on a background tab and DPR alignment unproven (A1-05, Q3) |
| browser.mouseMove |  | BiDi | input.performActions pointer and wheel sources | 1 | [ASSUMED] focus on a background tab and DPR alignment unproven (A1-05, Q3) |
| browser.mouseUp |  | BiDi | input.performActions pointer and wheel sources | 1 | [ASSUMED] focus on a background tab and DPR alignment unproven (A1-05, Q3) |
| browser.mouseWheel |  | BiDi | input.performActions pointer and wheel sources | 1 | [ASSUMED] focus on a background tab and DPR alignment unproven (A1-05, Q3) |
| browser.network |  | BiDi | log.entryAdded, network.* events, network.addDataCollector/getData | 1 | [ASSUMED] A1-11 |
| browser.openUrl |  | native | WebTabOpenHandler.openUrl | 1 | [ASSUMED] A1-23 |
| browser.pdf |  | BiDi | browsingContext.print | 1 | [ASSUMED] A1-04 |
| browser.profileClearDefaultCookies |  | native | Firefox import and clear-data | 3 | [ASSUMED] anti-feature, not planned (A1-26) |
| browser.profileClearGoogleCookies |  | native | Firefox import and clear-data | 3 | [ASSUMED] anti-feature, not planned (A1-26) |
| browser.profileCreate |  | BiDi+ | browser.createUserContext / getUserContexts / removeUserContext | 3 | [ASSUMED] not planned for v1.7: one PB profile; the external-Chromium provider drops this group too (A1-21) |
| browser.profileDelete |  | BiDi+ | browser.createUserContext / getUserContexts / removeUserContext | 3 | [ASSUMED] not planned for v1.7: one PB profile; the external-Chromium provider drops this group too (A1-21) |
| browser.profileDetectBrowsers |  | native | Firefox import and clear-data | 3 | [ASSUMED] anti-feature, not planned (A1-26) |
| browser.profileImportFromBrowser |  | native | Firefox import and clear-data | 3 | [ASSUMED] anti-feature, not planned (A1-26) |
| browser.profileList |  | BiDi+ | browser.createUserContext / getUserContexts / removeUserContext | 3 | [ASSUMED] not planned for v1.7: one PB profile; the external-Chromium provider drops this group too (A1-21) |
| browser.reload |  | native | PowerBrowserAPI.webTabBack / webTabForward / webTabReload | 1 | [ASSUMED] methods exist in the tree; not run through the seam (A1-01) |
| browser.screencast |  | impossible | none in 153.5.1: browsingContext.startScreencast is Firefox 154 | 3 | not needed: used only by the stock remote pane that PB replaces (A1-25) |
| browser.screencast.unsubscribe |  | impossible | none in 153.5.1: browsingContext.startScreencast is Firefox 154 | 3 | not needed: used only by the stock remote pane that PB replaces (A1-25) |
| browser.screenshot |  | BiDi | browsingContext.captureScreenshot | 1 | captureScreenshot on a PB web tab was shown by spike 003; --annotate needs BiDi+ and image compose, [ASSUMED] (A1-04) |
| browser.scroll |  | BiDi | input.performActions pointer and wheel sources | 1 | [ASSUMED] focus on a background tab and DPR alignment unproven (A1-05, Q3) |
| browser.scrollIntoView |  | BiDi+ | script.callFunction scrollIntoView | 1 | [ASSUMED] A1-05 |
| browser.select |  | BiDi+ | script.callFunction sets the value and dispatches input/change | 1 | [ASSUMED] A1-07 |
| browser.selectAll |  | BiDi+ | script.callFunction sets the value and dispatches input/change | 1 | [ASSUMED] A1-07 |
| browser.setCredentials |  | BiDi | network.continueWithAuth on network.authRequired | 2 | [ASSUMED] A1-19 |
| browser.setDevice |  | BiDi+ | setViewport plus emulation.setUserAgentOverride | 2 | [ASSUMED] touch emulation is absent in 153.5.1 (A1-18) |
| browser.setHeaders |  | BiDi | network.setExtraHeaders | 2 | [ASSUMED] A1-19 |
| browser.setMedia |  | actor | media-feature override from chrome or a content actor | 2 | [ASSUMED] emulation.setMediaFeaturesOverride is Firefox 159, absent in 153.5.1 (A1-19) |
| browser.setOffline |  | BiDi | emulation.setNetworkConditions | 2 | [ASSUMED] A1-19 |
| browser.snapshot |  | actor | content actor that builds the accessibility tree and binds @eN refs | 1 | [ASSUMED] no accessibility-tree command in Gecko 153.5.1; largest single piece (A1-03, Q2) |
| browser.storage.local.clear |  | BiDi+ | script.callFunction on localStorage / sessionStorage | 2 | [ASSUMED] A1-14 |
| browser.storage.local.get |  | BiDi+ | script.callFunction on localStorage / sessionStorage | 2 | [ASSUMED] A1-14 |
| browser.storage.local.set |  | BiDi+ | script.callFunction on localStorage / sessionStorage | 2 | [ASSUMED] A1-14 |
| browser.storage.session.clear |  | BiDi+ | script.callFunction on localStorage / sessionStorage | 2 | [ASSUMED] A1-14 |
| browser.storage.session.get |  | BiDi+ | script.callFunction on localStorage / sessionStorage | 2 | [ASSUMED] A1-14 |
| browser.storage.session.set |  | BiDi+ | script.callFunction on localStorage / sessionStorage | 2 | [ASSUMED] A1-14 |
| browser.tabClose |  | native | PB-owned table browserPageId to web tab widget (WebTabOpenHandler, TabUriRegistry) | 1 | [ASSUMED] the id cannot live in the tab URI (A1-20) |
| browser.tabCreate |  | native | PB-owned table browserPageId to web tab widget (WebTabOpenHandler, TabUriRegistry) | 1 | [ASSUMED] the id cannot live in the tab URI (A1-20) |
| browser.tabCurrent |  | native | PB-owned table browserPageId to web tab widget (WebTabOpenHandler, TabUriRegistry) | 1 | [ASSUMED] the id cannot live in the tab URI (A1-20) |
| browser.tabList |  | native | PB-owned table browserPageId to web tab widget (WebTabOpenHandler, TabUriRegistry) | 1 | [ASSUMED] the id cannot live in the tab URI (A1-20) |
| browser.tabProfileClone |  | BiDi+ | browser.createUserContext / getUserContexts / removeUserContext | 3 | [ASSUMED] not planned for v1.7: one PB profile; the external-Chromium provider drops this group too (A1-21) |
| browser.tabProfileShow |  | BiDi+ | browser.createUserContext / getUserContexts / removeUserContext | 3 | [ASSUMED] not planned for v1.7: one PB profile; the external-Chromium provider drops this group too (A1-21) |
| browser.tabSetProfile |  | BiDi+ | browser.createUserContext / getUserContexts / removeUserContext | 3 | [ASSUMED] not planned for v1.7: one PB profile; the external-Chromium provider drops this group too (A1-21) |
| browser.tabShow |  | native | PB-owned table browserPageId to web tab widget (WebTabOpenHandler, TabUriRegistry) | 1 | [ASSUMED] the id cannot live in the tab URI (A1-20) |
| browser.tabSwitch |  | native | PB-owned table browserPageId to web tab widget (WebTabOpenHandler, TabUriRegistry) | 1 | [ASSUMED] the id cannot live in the tab URI (A1-20) |
| browser.type |  | BiDi | input.performActions key source | 1 | key input into a PB web tab was shown by spike 003; focus on a background tab [ASSUMED] (A1-06, Q3) |
| browser.upload |  | BiDi | input.setFiles; picker case from input.fileDialogOpened | 2 | [ASSUMED] A1-08 |
| browser.viewport |  | BiDi | browsingContext.setViewport | 2 | [ASSUMED] may conflict with the overlay geometry PB owns (A1-18) |
| browser.wait |  | BiDi+ | script.callFunction polling; network idle from network.* events | 1 | [ASSUMED] A1-02 |
