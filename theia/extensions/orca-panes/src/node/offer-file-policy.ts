/**
 * Phase 67 (RUN-07; P67-08 holder 3, P67-09, T-67-12..T-67-14): the pure
 * verdicts the Theia backend applies before it hands the web-pairing offer to
 * the frontend. Imports nothing, so a Node check type-strips and imports it
 * (orca-offer-file, orca-failure-classes).
 *
 * A refusal is one reason code from OFFER_REFUSAL_REASONS, never the path, the
 * mode, the owner or the content. decodeOffer follows Orca's own steps
 * (web-pairing.ts readPairingInputFromLocation, parseWebPairingInput,
 * decodePairingPayload) and returns null where they would; the hostDescriptor
 * is not carried, since nothing here uses it.
 */

/** The offer-file refusals, the refusal half of the interfaces block's ORCA_CLIENT_REASONS. */
export const OFFER_REFUSAL_REASONS = [
    'offer-missing', 'offer-unreadable', 'offer-symlink', 'offer-not-regular', 'offer-owner', 'offer-mode', 'offer-endpoint',
] as const;
export type OfferRefusalReason = typeof OFFER_REFUSAL_REASONS[number];

/** OrcaPanesService.handOff's result (64 C6 plus P67-09's refusal); undefined: the files are not written yet. */
export type OfferHandOff = { pairing: string } | { refused: OfferRefusalReason } | undefined;

export type OfferVerdict = { ok: true } | { ok: false; reason: OfferRefusalReason };

/** The fields of an lstat result the verdict reads. */
export interface OfferStat {
    isSymbolicLink(): boolean;
    isFile(): boolean;
    mode: number;
    uid: number;
}

export interface DecodedOffer {
    v: 2;
    endpoint: string;
    deviceToken: string;
    publicKeyB64: string;
    pairedDeviceId?: string;
    scope?: 'mobile' | 'runtime';
}

const refuse = (reason: OfferRefusalReason): OfferVerdict => ({ ok: false, reason });

/**
 * stat is the lstat result, or null when there is none. On linux and darwin
 * the file must be owned by uid with no group or other bit; win32 ACLs are
 * Phase 68's, so there only the file type is judged.
 */
export function offerFileVerdict(input: { stat: OfferStat | null; uid: number; platform: string }): OfferVerdict {
    const { stat, uid, platform } = input;
    if (!stat) {
        return refuse('offer-missing');
    }
    if (stat.isSymbolicLink()) {
        return refuse('offer-symlink');
    }
    if (!stat.isFile()) {
        return refuse('offer-not-regular');
    }
    if (platform === 'linux' || platform === 'darwin') {
        if (stat.uid !== uid) {
            return refuse('offer-owner');
        }
        if ((stat.mode & 0o077) !== 0) {
            return refuse('offer-mode');
        }
    }
    return { ok: true };
}

// mobile-pairing-protocol-limits.ts at the pin.
const PAIRING_CODE_MAX_CHARACTERS = 128 * 1024;
const PAIRING_INPUT_MAX_CHARACTERS = PAIRING_CODE_MAX_CHARACTERS + 1024;
const PAIRING_KEYS = ['pairing', 'pair', 'code', 'token'];

/** readPairingInputFromLocation over orcad's web-client URL; any other text passes through trimmed. */
function pairingInputOf(text: string): string | null {
    const trimmed = text.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
        return trimmed;
    }
    let url: URL;
    try {
        url = new URL(trimmed);
    } catch {
        return null;
    }
    if (url.search.length + url.hash.length > PAIRING_INPUT_MAX_CHARACTERS) {
        return null;
    }
    for (const key of PAIRING_KEYS) {
        const value = url.searchParams.get(key);
        if (value?.trim()) {
            return value.trim();
        }
    }
    const hash = url.hash.replace(/^#/, '').trim();
    if (!hash) {
        return null;
    }
    if (hash.startsWith('orca://pair')) {
        return hash;
    }
    const params = new URLSearchParams(hash);
    for (const key of PAIRING_KEYS) {
        const value = params.get(key);
        if (value?.trim()) {
            return value.trim();
        }
    }
    return hash;
}

/** extractPairingCodeFromUrl: only orca://pair with an empty path carries a code. */
function codeOfPairingUrl(input: string): string | null {
    let parsed: URL;
    try {
        parsed = new URL(input);
    } catch {
        return null;
    }
    if (parsed.protocol !== 'orca:' || parsed.hostname !== 'pair' || (parsed.pathname !== '' && parsed.pathname !== '/')) {
        return null;
    }
    return parsed.searchParams.get('code') || (parsed.hash ? parsed.hash.slice(1) || null : null);
}

/** normalizePairingBase64 + atob + TextDecoder, as base64UrlToBytes; throws on an invalid code. */
function decodeBase64Url(value: string): string {
    if (value.length === 0 || value.length > PAIRING_CODE_MAX_CHARACTERS || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) {
        throw new Error('invalid');
    }
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    if (base64.length % 4 === 1) {
        throw new Error('invalid');
    }
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return new TextDecoder().decode(bytes);
}

function decodePayload(code: string): DecodedOffer | null {
    const parsed = JSON.parse(decodeBase64Url(code)) as Partial<DecodedOffer> | null;
    if (!parsed || parsed.v !== 2
        || typeof parsed.endpoint !== 'string' || parsed.endpoint.length === 0
        || typeof parsed.deviceToken !== 'string' || parsed.deviceToken.length === 0
        || typeof parsed.publicKeyB64 !== 'string' || parsed.publicKeyB64.length === 0) {
        return null;
    }
    const endpoint = parsed.endpoint.startsWith('http://') ? `ws://${parsed.endpoint.slice(7)}`
        : parsed.endpoint.startsWith('https://') ? `wss://${parsed.endpoint.slice(8)}` : parsed.endpoint;
    const scope = parsed.scope === 'mobile' || parsed.scope === 'runtime' ? parsed.scope : null;
    const pairedDeviceId = typeof parsed.pairedDeviceId === 'string' && parsed.pairedDeviceId.length > 0 ? parsed.pairedDeviceId : null;
    return {
        v: 2,
        endpoint,
        deviceToken: parsed.deviceToken,
        publicKeyB64: parsed.publicKeyB64,
        ...(pairedDeviceId ? { pairedDeviceId } : {}),
        ...(scope ? { scope } : {}),
    };
}

/** The offer in a hand-off text (orcad's web-client URL or a bare offer), or null where Orca's parser yields none. */
export function decodeOffer(text: string): DecodedOffer | null {
    if (typeof text !== 'string' || text.length > PAIRING_INPUT_MAX_CHARACTERS) {
        return null;
    }
    const input = pairingInputOf(text);
    if (!input) {
        return null;
    }
    try {
        if (input.toLowerCase().startsWith('orca://')) {
            const code = codeOfPairingUrl(input);
            return code ? decodePayload(code) : null;
        }
        return decodePayload(input);
    } catch {
        return null;
    }
}

/** orcad's port as the hand-off text states it: the port of a web-client URL at http://127.0.0.1:<port>, else undefined. */
export function offerPortOf(text: string): number | undefined {
    const match = /^http:\/\/127\.0\.0\.1:([1-9][0-9]*)\//.exec(text.trim());
    return match ? Number(match[1]) : undefined;
}

/**
 * Audit fix 67-WR-03: the key of the sidecar environment (POWERBROWSER_ENV) that carries the port PowerBrowser
 * started orcad on. The supervisor sets it at sidecar start, so the offer file cannot supply it.
 */
export const ORCAD_PORT_ENV = 'POWERBROWSER_ORCA_PORT';

/** A port from the supervisor's environment: a decimal integer from 1024 to 32767, else undefined. */
export function orcadPortOf(value: unknown): number | undefined {
    if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
        return undefined;
    }
    const port = Number(value);
    return port >= 1024 && port <= 32767 ? port : undefined;
}

/**
 * The port the offer's endpoint must name (P67-09, T-67-13): orcad's own, never a port read from the same file as
 * the endpoint. On linux and darwin an unknown orcad port refuses the offer; a web-client URL whose port differs from
 * orcad's refuses it too. On win32, where the supervisor may not pass the port yet, the text's port is the fallback.
 */
export function expectedOfferPort(text: string, orcadPort: number | undefined, platform: string): { ok: true; port: number | undefined } | { ok: false; reason: OfferRefusalReason } {
    const stated = offerPortOf(text);
    if (orcadPort === undefined) {
        return platform === 'linux' || platform === 'darwin' ? { ok: false, reason: 'offer-endpoint' } : { ok: true, port: stated };
    }
    if (stated !== undefined && stated !== orcadPort) {
        return { ok: false, reason: 'offer-endpoint' };
    }
    return { ok: true, port: orcadPort };
}

/** OrcaEnv.isLoopbackEndpoint's rule: ws://127.0.0.1:<n>[/], n an integer from 1024 to 32767, equal to port when known. */
export function offerEndpointVerdict(offer: { endpoint?: unknown } | null, port?: number): OfferVerdict {
    const match = typeof offer?.endpoint === 'string' ? /^ws:\/\/127\.0\.0\.1:([1-9][0-9]*)\/?$/.exec(offer.endpoint) : null;
    const n = match ? Number(match[1]) : NaN;
    if (!Number.isInteger(n) || n < 1024 || n > 32767 || (port !== undefined && n !== port)) {
        return refuse('offer-endpoint');
    }
    return { ok: true };
}
