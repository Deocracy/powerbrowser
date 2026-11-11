/**
 * Phase 67 (RUN-06; P67-01, P67-02, P67-32): the PowerBrowser page a hosted
 * Orca view shows in place of its hidden pane root while a failure class is
 * set. Every rendered string is a reference to orca-failure-copy.ts; the
 * sentence region is aria-live polite and the buttons are native, so they are
 * keyboard reachable. The page tells the status client it is shown, which
 * keeps the one-second orcaStatus poll running (P67-07).
 */
import * as React from '@theia/core/shared/react';
import {
    ORCA_BUTTON_LABELS, ORCA_FAILURE_BUTTONS, ORCA_FAILURE_COPY, ORCA_PROTECTION_SENTENCE, OrcaFailureButton, OrcaFailureClass
} from './orca-failure-copy';
import type { OrcaHostingStatus } from './orca-hosting-status';

export interface OrcaFailurePageProps {
    failureClass: OrcaFailureClass;
    status: OrcaHostingStatus;
}

const PAGE_STYLE: React.CSSProperties = {
    width: '100%', height: '100%', boxSizing: 'border-box', padding: '24px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px',
};
const TEXT_STYLE: React.CSSProperties = { maxWidth: '36em', textAlign: 'center' };
const BUTTONS_STYLE: React.CSSProperties = { display: 'flex', gap: '8px' };

export function OrcaFailurePage({ failureClass, status }: OrcaFailurePageProps): React.ReactElement {
    React.useEffect(() => {
        const handle = {};
        status.show(handle);
        return () => status.hide(handle);
    }, [status]);
    const copy = ORCA_FAILURE_COPY[failureClass];
    const actions: Record<OrcaFailureButton, () => void> = {
        restart: () => void status.restart(),
        // Re-pair through repair(offer), or re-attach the browser host for browser-not-attached (P67-06, P67-36).
        reconnect: () => void status.reconnect(),
        details: () => void status.showDetails(),
    };
    return (
        <div className='pb-orca-failure-page' data-pb-orca-failure={failureClass} style={PAGE_STYLE}>
            <div aria-live='polite' style={TEXT_STYLE}>
                <p>{copy.message}</p>
                {copy.protection ? <p>{ORCA_PROTECTION_SENTENCE}</p> : undefined}
            </div>
            <div style={BUTTONS_STYLE}>
                {ORCA_FAILURE_BUTTONS[failureClass].map((id, index) => (
                    <button key={id} type='button' className={index === 0 ? 'theia-button' : 'theia-button secondary'}
                        data-pb-orca-failure-button={id} onClick={actions[id]}>
                        {ORCA_BUTTON_LABELS[id]}
                    </button>
                ))}
            </div>
        </div>
    );
}
