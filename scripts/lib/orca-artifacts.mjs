// scripts/lib/orca-artifacts.mjs -- Orca's own artifact tables, for the Phase 68 packaging checks
// (PLAT-01, P68-06, P68-31, P68-33).
//
// What is derived, at check time, from the pinned Orca source:
//   - the slot-marker file names (the *_FILENAME constants a Node or Bun slot writes into out/orcad,
//     which a de-slotted PowerBrowser tree must not carry), from orca/src/shared/orcad-artifacts.ts;
//   - ORCAD_RIPGREP_ARTIFACTS, the per-target ripgrep paths, from the same file;
//   - orcadAgentBrowserNativeName, the per-target agent-browser binary name, from
//     orca/src/shared/orcad-agent-browser-name.ts.
// Both files are imported by Node's type stripping (Orca keeps them erasable-only TypeScript for
// exactly this). No value is copied into this repository: a copy could only ever agree with the pin it
// was copied from. An import failure or an empty table throws "Orca's artifact tables moved", so every
// check built on this module is red, never vacuously green, after an upstream rename.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ARTIFACTS_REL = 'src/shared/orcad-artifacts.ts';
const AGENT_BROWSER_REL = 'src/shared/orcad-agent-browser-name.ts';
// The constants whose values are slot markers. The names are Orca's API; the values are read from the pin.
const MARKER_CONSTANTS = ['ORCAD_SERVER_TARGET_FILENAME', 'ORCAD_NODE_RUNTIME_MARKER_FILENAME', 'ORCAD_VERSION_FILENAME', 'ORCAD_BUILD_TARGET_FILENAME'];

function moved(rel, why) {
    return new Error(`Orca's artifact tables moved (orca/${rel}: ${why}); re-read orca/src/shared/orcad-artifacts.ts`);
}

async function importTs(orcaRoot, rel) {
    const file = join(orcaRoot, rel);
    if (!existsSync(file)) throw moved(rel, 'file absent');
    // orca/package.json declares no "type", so Node warns that it re-parses the file as ESM; only that warning is muted.
    const emit = process.emitWarning;
    process.emitWarning = function (w, ...a) {
        if ((typeof a[0] === 'object' ? a[0]?.code : a[1]) === 'MODULE_TYPELESS_PACKAGE_JSON') return undefined;
        return emit.call(process, w, ...a);
    };
    try {
        return await import(pathToFileURL(file).href);
    } catch (err) {
        throw moved(rel, `import failed: ${String(err.message).split('\n')[0]}`);
    } finally {
        process.emitWarning = emit;
    }
}

/** { markerNames, ripgrepArtifacts, agentBrowserName(platform, arch) } read from orcaRoot's source. */
export async function orcaArtifactTables(orcaRoot) {
    const artifacts = await importTs(orcaRoot, ARTIFACTS_REL);
    const browser = await importTs(orcaRoot, AGENT_BROWSER_REL);
    const markerNames = MARKER_CONSTANTS.map((c) => artifacts[c]).filter((v) => typeof v === 'string' && v !== '');
    if (markerNames.length !== MARKER_CONSTANTS.length) {
        throw moved(ARTIFACTS_REL, `derived ${markerNames.length} of ${MARKER_CONSTANTS.length} slot-marker names (${MARKER_CONSTANTS.join(', ')})`);
    }
    const ripgrepArtifacts = Array.isArray(artifacts.ORCAD_RIPGREP_ARTIFACTS) ? [...artifacts.ORCAD_RIPGREP_ARTIFACTS] : [];
    if (ripgrepArtifacts.length === 0) throw moved(ARTIFACTS_REL, 'ORCAD_RIPGREP_ARTIFACTS is absent or empty');
    if (typeof browser.orcadAgentBrowserNativeName !== 'function') throw moved(AGENT_BROWSER_REL, 'orcadAgentBrowserNativeName is not exported');
    return { markerNames, ripgrepArtifacts, agentBrowserName: (platform, arch) => browser.orcadAgentBrowserNativeName(platform, arch) };
}
