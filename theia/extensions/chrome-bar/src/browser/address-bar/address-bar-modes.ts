import type { CancellationToken } from '@theia/core/lib/common';
import type { Row } from './address-bar-rows';
import type { LocalModeId } from './address-bar-mode-table';

/**
 * Phase 30 (D-06): one address-bar mode, contributed through
 * AddressBarModeContribution. Engines are not contributions: their modes are
 * generated from chrome's engine list (D-07). The static fields mirror
 * LOCAL_MODES in address-bar-mode-table.ts; the label comes from
 * CHROME_BAR_COPY.modeLabels.
 */
export interface AddressBarMode {
    id: LocalModeId;
    label: string;
    iconClass: string;
    restrictToken?: string;
    provide?(text: string, token: CancellationToken): Promise<Row[]>;
}

/**
 * The contribution point, bound with bindContributionProvider at module load
 * (D-50: a contribution bound after first enumeration is invisible). A mode
 * that is not contributed is absent from the menu, and a default naming it
 * falls back to Address.
 */
export const AddressBarModeContribution = Symbol('AddressBarModeContribution');
