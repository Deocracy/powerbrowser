import { injectable } from '@theia/core/shared/inversify';
import { Endpoint } from '@theia/core/lib/browser/endpoint';
import { WebviewEnvironment } from '@theia/plugin-ext/lib/main/browser/webview/webview-environment';
import { WEBVIEW_LOOPBACK_HOSTNAME } from '@powerbrowser/token-gate/lib/common/webview-host';

/**
 * Plan 38-07. Theia's pattern `{{uuid}}.webview.{{hostname}}` stays as it is (so `hostPatternPromise` is
 * still the default and the backend's vhost and websocket checks still match); only the hostname
 * substituted into it changes, from the sidecar's 127.0.0.1 to the loopback name Gecko resolves itself.
 * The port stays: Theia carries it inside `{{hostname}}` and never appends it.
 */
@injectable()
export class WebviewLoopbackEnvironment extends WebviewEnvironment {
    protected override async doInit(): Promise<void> {
        this._hostPatternPromise = this.getHostPattern();
        try {
            const endpointPattern = await this.hostPatternPromise;
            const host = new Endpoint().host.replace(/^127\.0\.0\.1(?=:|$)/, WEBVIEW_LOOPBACK_HOSTNAME);
            this.externalEndpointHost.resolve(endpointPattern.replace('{{hostname}}', host));
        } catch (e) {
            this.externalEndpointHost.reject(e);
        }
    }
}
