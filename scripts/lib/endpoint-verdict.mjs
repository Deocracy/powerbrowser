// scripts/lib/endpoint-verdict.mjs
//
// The one host-matching and verdict rule for powerbrowser/endpoint-allowlist.json (UPD-33).
// Pure: no I/O. scripts/verify-endpoints.sh layer 3 is an unattended capture and calls
// violations() with `userAction: false`; its --disposition-self-test calls both modes over
// fixture logs. Layer 4 (scripts/verify-ng-069-sidecar-egress.mjs) calls violations() with
// `userAction: false` over the hosts the sidecar resolved; its static check of derived hosts
// stays a presence rule.

// allow: may be contacted unattended. deny: must never be contacted. user-initiated: reachable
// only after a user action such as a click; an unattended request fails exactly like deny.
export const DISPOSITIONS = Object.freeze(['allow', 'deny', 'user-initiated']);

// Exact host, or a suffix match only when the entry begins with a literal dot -- a host that
// merely contains an allowlisted string does not match.
export function entryFor(hosts, host) {
  return hosts.find(h => h.host === host || (h.host.startsWith('.') && host.endsWith(h.host)));
}

// The sorted unique observed hosts that fail: no entry, a deny entry, or a user-initiated entry
// observed without a user action.
export function violations(hosts, observed, { userAction = false } = {}) {
  const bad = new Set();
  for (const host of observed) {
    const d = entryFor(hosts, host)?.disposition;
    if (d === 'allow' || (d === 'user-initiated' && userAction)) continue;
    bad.add(host);
  }
  return [...bad].sort();
}
