// RUN-08 hotfix (67-RESEARCH P67-13/P67-14). The token cookie is host-only on 127.0.0.1, and two loopback ports
// are the same site, so a page on another 127.0.0.1 port in a stock window sends it with every request. Only
// the sidecar's own origin may reach it: an allow-list, so an unknown Sec-Fetch-Site value is refused.
// Recorded classes it admits: the chrome health probe (no Origin, no Sec-Fetch-*), the shell's navigation
// into Theia (Sec-Fetch-Site none) and everything the Theia document and its workers send (same-origin, own
// Origin on POST and WebSocket). scripts/verify-sidecar-origin-gate.mjs loads this file.
export type OriginVerdict = 'allow' | 'foreign-origin' | 'foreign-fetch-site';

const SAME_ORIGIN_SITES = new Set(['same-origin', 'none']);

export function originVerdict(origin: string | undefined, fetchSite: string | undefined, port: number | undefined): OriginVerdict {
    if (port === undefined) {
        // Fail closed: before announce() there is no own origin to compare with.
        return 'foreign-origin';
    }
    if (origin !== undefined && origin !== `http://127.0.0.1:${port}`) {
        return 'foreign-origin';
    }
    if (fetchSite !== undefined && !SAME_ORIGIN_SITES.has(fetchSite)) {
        return 'foreign-fetch-site';
    }
    return 'allow';
}
