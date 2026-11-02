// Plan 38-07. Theia gives each webview its own origin, `{{uuid}}.webview.{{hostname}}`. The sidecar's
// hostname is 127.0.0.1, and `<uuid>.webview.127.0.0.1` resolves nowhere: glibc refuses it and Gecko
// resolves only `*.localhost` itself. Webviews therefore use this loopback name in its place, keeping
// Theia's pattern and the sidecar's port. scripts/verify-ext-network-wall.mjs reads this literal.
export const WEBVIEW_LOOPBACK_HOSTNAME = 'localhost';

const WEBVIEW_HOST = new RegExp(`^[^.]+\\.webview\\.${WEBVIEW_LOOPBACK_HOSTNAME.replace(/\./g, '\\.')}(:\\d+)?$`, 'i');

/** True when a Host header names a webview origin on the loopback name. */
export function isWebviewHost(host: string | undefined): boolean {
    return !!host && WEBVIEW_HOST.test(host);
}
