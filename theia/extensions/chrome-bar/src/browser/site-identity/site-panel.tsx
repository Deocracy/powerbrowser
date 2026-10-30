import * as React from '@theia/core/shared/react';
import { createPortal } from '@theia/core/shared/react-dom';
import type { WebTabPermissionRow, WebTabSiteInfo } from '@powerbrowser/tab-uris/lib/browser/web-tab';
import { CHROME_BAR_COPY, appSubject } from '../chrome-bar-copy';
import { SECURITY_STATES, nextPermissionState } from './site-identity-table';

/**
 * Phase 31 plan 02 (SITE-04..06, D-31-14): the site panel. A
 * `.pb-chrome-bar-dropdown.pb-site-panel` portal anchored under the identity
 * box: the connection header, the certificate block (secure pages only), and
 * one tri-state row per managed permission. Rows arrive from chrome, labels
 * included; the panel keeps no permission name of its own.
 */

/** The icon for each managed permission. Keyed by the upstream IDs, so an icon is never a label. */
export const PERMISSION_GLYPH_CLASS: Readonly<Record<string, string>> = Object.freeze({
    camera: 'codicon-eye',
    microphone: 'codicon-mic',
    geo: 'codicon-location',
    'desktop-notification': 'codicon-bell',
    'autoplay-media': 'codicon-play',
    popup: 'codicon-window',
});

/** The row's state word: the panel's tri-state copy, never the raw state name. */
export function permissionStateLabel(state: string): string {
    switch (state) {
        case 'allow': return CHROME_BAR_COPY.permissionAllow;
        case 'block': return CHROME_BAR_COPY.permissionBlock;
        case 'block-audible': return CHROME_BAR_COPY.permissionBlockAudible;
        case 'block-all': return CHROME_BAR_COPY.permissionBlockAll;
        default: return CHROME_BAR_COPY.permissionDefault;
    }
}

export interface SitePanelProps {
    /** The tab's site information; null when chrome did not answer with a panel-ready reply. */
    info: WebTabSiteInfo | null;
    /** The panel's top-left corner in viewport pixels: under the identity box. */
    anchor: { top: number; left: number };
    /** The state the user last chose per row in this open panel; a click moves from it when present, else from the row's stored state. */
    intents: Readonly<Record<string, string>>;
    /** The pill's typed-or-committed text; the host line falls back to it when chrome gave no display host. */
    committedAddress: string;
    /** A one-line failure notice for the last action (for example a refused clear); null when there is none. */
    notice: string | null;
    onClose(): void;
    onSetPermission(id: string, state: string): void;
    /** Phase 31 plan 03: the clear-data row; the owner opens the confirm and clears on accept. */
    onClearSiteData(): void;
    /** Phase 31 plan 03 (SITE-08): the shield toggle; `except` is the exception state to set. */
    onToggleShield(except: boolean): void;
}

/** Phase 31 plan 02: the site panel, portalled to the body like every pill dropdown. */
export function SitePanel(props: SitePanelProps): React.ReactElement {
    const { info, anchor, intents, committedAddress, notice, onClose, onSetPermission, onClearSiteData, onToggleShield } = props;
    const rootRef = React.useRef<HTMLDivElement>(null);
    // Focus on mount only: a re-render (a permission reply) must not pull focus back from a row.
    React.useEffect(() => { rootRef.current?.focus(); }, []);
    const display = typeof info?.displaySpec === 'string' && info.displaySpec ? info.displaySpec : committedAddress;
    const raw = typeof info?.securityState === 'string' ? info.securityState : 'none';
    const state = (SECURITY_STATES as readonly string[]).includes(raw) ? raw : 'none';
    const base = typeof info?.baseDomain === 'string' && info.baseDomain ? info.baseDomain : null;
    const icon = state === 'secure' ? 'codicon-lock'
        : state === 'insecure' ? 'codicon-unlock'
            : state === 'mixed-passive' || state === 'broken' ? 'codicon-warning' : null;
    // UI-SPEC "Copywriting Contract": the secure and insecure header lines are fixed copy.
    const connection = state === 'secure' ? CHROME_BAR_COPY.siteConnectionSecure
        : state === 'insecure' ? CHROME_BAR_COPY.siteConnectionInsecure
            : state === 'local' ? CHROME_BAR_COPY.siteConnectionLocal(display)
                : state === 'mixed-passive' || state === 'broken' ? CHROME_BAR_COPY.siteConnectionWarning(display)
                    : null;
    const labelled = state === 'secure' ? CHROME_BAR_COPY.identitySecureLabel(display)
        : state === 'insecure' ? CHROME_BAR_COPY.identityInsecureLabel(display)
            : state === 'local' ? CHROME_BAR_COPY.identityLocalLabel(display)
                : state === 'mixed-passive' || state === 'broken' ? CHROME_BAR_COPY.identityWarningLabel(display)
                    : CHROME_BAR_COPY.connectionWarning;
    const usable = !!info && connection !== null && state !== 'none' && Array.isArray(info.permissions);
    const permissions: WebTabPermissionRow[] = usable && info?.permissions ? info.permissions : [];
    // The empty row says no entry is saved; a default-equal effective state is not a saved entry.
    const allDefault = permissions.every(row => row.stored === 'default');
    // The certificate is shown for a secure page only, as read-only text: issuer, subject and validity.
    const issuedTo = typeof info?.subject === 'string' && info.subject ? info.subject : null;
    const issuedBy = typeof info?.issuer === 'string' && info.issuer ? info.issuer : null;
    const dates = typeof info?.validFrom === 'string' && typeof info?.validTo === 'string' && info.validFrom && info.validTo
        ? CHROME_BAR_COPY.certDates(info.validFrom, info.validTo) : null;
    const showCert = usable && state === 'secure' && (issuedTo !== null || issuedBy !== null);
    // Focus leaving the panel for anywhere but the panel itself (a page, the pill) is an outside click.
    return createPortal(
        <div
            ref={rootRef}
            className='pb-chrome-bar-dropdown pb-site-panel'
            role='dialog'
            aria-label={labelled}
            tabIndex={-1}
            style={{ position: 'fixed', top: anchor.top, left: anchor.left, maxHeight: Math.max(0, Math.min(432, window.innerHeight - anchor.top - 8)) }}
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
            onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) { onClose(); } }}
        >
            {notice && <div className='pb-site-panel-notice' role='alert'>{notice}</div>}
            {usable
                ? <div className='pb-site-panel-header'>
                    {icon && <span className={`pb-site-panel-icon codicon ${icon}${state === 'mixed-passive' || state === 'broken' ? ' is-warning' : ''}`} aria-hidden='true' />}
                    <div className='pb-site-panel-titles'>
                        <span className='pb-site-panel-connection'>{connection}</span>
                        <span className='pb-site-panel-host'>{display}</span>
                        {base && <span className='pb-site-panel-base'>{base}</span>}
                    </div>
                </div>
                : <div className='pb-site-panel-empty'>{CHROME_BAR_COPY.siteUnavailable(appSubject())}</div>}
            {showCert && <div className='pb-site-panel-section'>
                <div className='pb-site-panel-heading'>{CHROME_BAR_COPY.certificateHeading}</div>
                {issuedTo !== null && <div className='pb-site-panel-cert-row'>{CHROME_BAR_COPY.certIssuedTo(issuedTo)}</div>}
                {issuedBy !== null && <div className='pb-site-panel-cert-row'>{CHROME_BAR_COPY.certIssuedBy(issuedBy)}</div>}
                {dates !== null && <div className='pb-site-panel-cert-row'>{CHROME_BAR_COPY.certValid(dates)}</div>}
            </div>}
            {usable && <div className='pb-site-panel-section'>
                <div className='pb-site-panel-heading'>{CHROME_BAR_COPY.permissionsHeading}</div>
                {allDefault && <div className='pb-site-panel-empty-row'>{CHROME_BAR_COPY.noPermissions}</div>}
                {permissions.map(row => {
                    const label = row.label ?? CHROME_BAR_COPY.permissionLabelFallback;
                    const stateText = permissionStateLabel(row.state);
                    return <button
                        key={row.id}
                        type='button'
                        className='pb-site-panel-row'
                        data-permission={row.id}
                        data-state={row.state}
                        data-stored={row.stored}
                        aria-label={CHROME_BAR_COPY.permissionControlLabel(label, display, stateText)}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => onSetPermission(row.id, nextPermissionState(row.id, intents[row.id] ?? row.stored))}
                    >
                        <span className={`pb-site-panel-row-icon codicon ${PERMISSION_GLYPH_CLASS[row.id] ?? ''}`} aria-hidden='true' />
                        <span className='pb-site-panel-row-label'>{label}</span>
                        <span className='pb-site-panel-row-state'>{stateText}</span>
                    </button>;
                })}
            </div>}
            {usable && info?.shield && <div className='pb-site-panel-section'>
                <div className='pb-site-panel-shield-count' data-shield-count={info.shield.count} data-shield-excepted={info.shield.excepted}>
                    {info.shield.excepted ? CHROME_BAR_COPY.shieldExcepted
                        : info.shield.count === 0 ? CHROME_BAR_COPY.shieldClean
                            : info.shield.count === 1 ? CHROME_BAR_COPY.trackerBlockedOne
                                : CHROME_BAR_COPY.trackersBlocked(info.shield.count)}
                </div>
                {(info.shield.count > 0 || info.shield.excepted) && <button
                    type='button'
                    className='pb-site-panel-row'
                    data-action='shield-toggle'
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => onToggleShield(!info.shield?.excepted)}
                >
                    <span className='pb-site-panel-row-icon codicon codicon-shield' aria-hidden='true' />
                    <span className='pb-site-panel-row-label'>{info.shield.excepted ? CHROME_BAR_COPY.shieldTurnOn : CHROME_BAR_COPY.shieldTurnOff}</span>
                </button>}
            </div>}
            {usable && <div className='pb-site-panel-section'>
                <button
                    type='button'
                    className='pb-site-panel-row'
                    data-action='clear-site-data'
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => onClearSiteData()}
                >
                    <span className='pb-site-panel-row-icon codicon codicon-trash' aria-hidden='true' />
                    <span className='pb-site-panel-row-label'>{CHROME_BAR_COPY.clearDataRow}</span>
                </button>
            </div>}
            <button type='button' className='pb-site-panel-close' onMouseDown={e => e.preventDefault()} onClick={onClose}>
                <span className='codicon codicon-close' aria-hidden='true' />
            </button>
        </div>,
        document.body
    );
}
