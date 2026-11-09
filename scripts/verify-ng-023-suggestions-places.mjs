#!/usr/bin/env node
// scripts/verify-ng-023-suggestions-places.mjs
//
// NG-023: address-bar suggestions include history and bookmark matches, not
// only open tabs (13-UI-SPEC.md:141,192). Live, chrome-side (live-main).
// Driven through the DI-bound ChromeBarSuggestionService, the service the
// chrome bar widget injects and calls on every keystroke. Fixtures: one open
// tab, one history-only page, one bookmark, plus a bookmarklet and a file:
// bookmark that must never be offered as an address. Also: each address
// once, open tabs first, at most 8 rows, a typed % matches literally, and a
// 127.0.0.1 page in the selected stock tab cannot run the Places search. The
// positive control: the same searchPlaces message from the Theia frame is
// served, and the page's own request reaches chrome's handler for the kind.

import { GET_BY_NAME, actorRequest, actorRequestExpr, diCall, runCheck, seedPlaces, servePages, shellContext, unanswered, until, waitTheiaReady, withProfile } from './lib/ng-b-live.mjs';

const NAME = 'ng-023-suggestions-history-bookmarks';
const NONCE = `ng023${Date.now().toString(36)}`;
const HISTORY_ONLY = { url: `https://example.invalid/${NONCE}/history-only`, title: `HistoryOnly ${NONCE}` };
const BOOKMARKED = { url: `https://example.invalid/${NONCE}/bookmarked`, title: `Bookmarked ${NONCE}` };
const BOOKMARKLET = { url: `javascript:void('${NONCE}')`, title: `Bookmarklet ${NONCE}` };
const FILE_BOOKMARK = { url: `file:///tmp/${NONCE}.html`, title: `File ${NONCE}` };

runCheck(NAME, async () => {
    const failures = [];
    const pages = await servePages({ '/open': { title: `Open ${NONCE}` } });
    const openUrl = pages.url('/open');
    try {
        await withProfile(openUrl, async ({ evaluate, evaluateIn, send, topLevelContexts }) => {
            const shell = await shellContext(topLevelContexts, pages.origin);
            await waitTheiaReady(evaluateIn, shell);
            await seedPlaces(send, { history: [HISTORY_ONLY], bookmarks: [BOOKMARKED, BOOKMARKLET, FILE_BOOKMARK] });
            // WINDOWS 38: the launch URL sits in a stock tab, and an open-tab row is kept only for a shell web tab
            // (b9bdc702, WR-06), so the open tab under test is a Theia web tab on the same address.
            const opened = await evaluateIn(shell, `(async () => { ${GET_BY_NAME}
                await __getByName(window.theia.container, 'WebTabOpenHandler').openUrl(${JSON.stringify(openUrl)});
                return true;
            })()`);
            if (opened !== true) failures.push(`harness: the open tab could not be opened in the shell: ${JSON.stringify(opened)}`);
            const search = prefix => diCall(evaluateIn, shell, 'ChromeBarSuggestionService', 'searchByPrefix', [prefix, 8]);
            // The open tab's row lands once its page has loaded (hasPage): poll for it with a small
            // budget, then take one final reading. History and bookmark rows
            // never arrive (NG-023 is unbuilt), so waiting on all three
            // would burn the backend's ~8-query evaluation budget and hang
            // the check instead of failing red.
            const openRow = r => r.value && r.value.some(row => row.url === openUrl && row.source === 'tab');
            const open = (await until(async () => {
                const r = await search(NONCE);
                return openRow(r) ? r : undefined;
            }, 20000)) ?? await search(NONCE);
            const want = [openUrl, HISTORY_ONLY.url, BOOKMARKED.url];
            const complete = r => r.value && want.every(u => r.value.some(row => row.url === u));
            const final = complete(open) ? open : await search(NONCE);
            const rows = final.value ?? [];
            const urls = rows.map(row => row.url);
            for (const u of want) {
                if (!urls.includes(u)) failures.push(`the suggestions for the typed text lack ${u}: ${JSON.stringify(final)}`);
            }
            const openSource = rows.find(row => row.url === openUrl)?.source;
            if (openSource && openSource !== 'tab') failures.push(`the open tab came back as a ${openSource} row, not an open-tab row: ${JSON.stringify(rows)}`);
            if (urls.some(u => !/^https?:\/\//.test(u))) failures.push(`a non-web address was suggested: ${JSON.stringify(urls)}`);
            if (new Set(urls).size !== urls.length) failures.push(`an address was suggested twice: ${JSON.stringify(urls)}`);
            if (rows.length > 8) failures.push(`${rows.length} rows came back; the dropdown cap is 8`);
            const placeIndexes = [HISTORY_ONLY.url, BOOKMARKED.url].map(u => urls.indexOf(u)).filter(i => i >= 0);
            if (urls.includes(openUrl) && placeIndexes.some(i => i < urls.indexOf(openUrl))) {
                failures.push(`an open tab ranks below a history or bookmark match: ${JSON.stringify(urls)}`);
            }
            const percent = await search('%');
            if (percent.error) failures.push(`typing % made the suggestion service throw: ${percent.error}`);
            if ((percent.value ?? []).some(row => row.url.includes(NONCE))) failures.push('typing % listed the fixtures -- the Places search does not escape wildcards');
            // The same message the hostile page sends below, from the shell frame: it
            // must be served, so the hostile refusal is the wall and not a missing kind.
            const places = { kind: 'searchPlaces', text: NONCE, limit: 8 };
            const own = await actorRequest(evaluateIn, shell, places);
            if (own.reply?.ok !== true) failures.push(`actor searchPlaces from the Theia frame answered ${JSON.stringify(own)}`);
            const hostile = JSON.parse(await evaluate(actorRequestExpr(places, 4000)));
            const silent = unanswered(hostile, 'searchPlaces');
            if (silent) failures.push(silent);
            if (hostile.reply?.ok === true || JSON.stringify(hostile).includes(`${NONCE}/`)) {
                failures.push(`a 127.0.0.1 page in a stock tab ran the Places search: ${JSON.stringify(hostile)}`);
            }
        });
    } finally {
        await pages.close();
    }
    return failures;
});
