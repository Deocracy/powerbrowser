# Test-only TLS fixture for live checks

Never trust these outside a throwaway test profile.

- `test-ca.pem`: the "PB Fixture CA" root, valid until 2036. Its private key is deliberately not committed, so nothing new can be signed with it.
- `pb-fixture.pem` and `pb-fixture.key`: the server certificate and key for `pb-fixture.test` and `www.pb-fixture.test`, valid until 2036.

How a live check uses them:
1. Map the host to loopback in the probe profile with `network.dns.localDomains=pb-fixture.test,www.pb-fixture.test`.
2. Trust the CA in that profile only, with `nsIX509CertDB.addCertFromBase64(<test-ca.pem body>, 'C,,')`.
3. Serve the pages with `node:https`, using the certificate and key.

To reissue the certificate, see `.planning/milestones/v1.5-phases/31-site-identity-permissions-and-app-menu/31-01-LIVE-HANDOFF.md`. It needs the CA key, which is kept outside the repo.
