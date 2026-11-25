/**
 * Phase 63 (EXT-02, P63-26): the per-profile launcher <bridge dir>/claude-wrapper.
 *
 * The Claude Code extension runs `<claudeProcessWrapper> <claude path> <args...>`
 * (research assumption A3). The launcher is a POSIX sh script that execs
 * PowerBrowser's Node on bin/claude-wrapper.mjs with --bridge-dir first, so the
 * wrapper finds orcad-data-root beside itself and reads nothing from its
 * environment. Node built-ins only.
 */
import * as fs from 'fs';
import * as path from 'path';
import { CLAUDE_WRAPPER_FILE } from '../common/orca-agents-protocol';

/** One sh word: single-quoted, each embedded single quote written as '\''. */
export function shQuote(value: string): string {
    return `'${value.split("'").join(`'\\''`)}'`;
}

export function launcherText(options: { nodePath: string; wrapperPath: string; bridgeDir: string }): string {
    const { nodePath, wrapperPath, bridgeDir } = options;
    return `#!/bin/sh\nexec ${shQuote(nodePath)} ${shQuote(wrapperPath)} --bridge-dir ${shQuote(bridgeDir)} "$@"\n`;
}

/** Writes the launcher through a temporary name with mode 0700, renames it into place, returns its path. */
export function writeLauncher(bridgeDir: string, nodePath: string, wrapperPath: string): string {
    const target = path.join(bridgeDir, CLAUDE_WRAPPER_FILE);
    const temp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temp, launcherText({ nodePath, wrapperPath, bridgeDir }), { mode: 0o700 });
    try {
        fs.chmodSync(temp, 0o700);
        fs.renameSync(temp, target);
    } catch (err) {
        fs.rmSync(temp, { force: true });
        throw err;
    }
    return target;
}
