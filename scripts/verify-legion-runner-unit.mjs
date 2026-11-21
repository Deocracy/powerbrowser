#!/usr/bin/env node
// scripts/verify-legion-runner-unit.mjs
//
// The legion-runner-unit row (audit-fix G5b: 59-CR-01, 59-CR-02, packaging-prefs-network-01).
// Reads systemd/legion-pb.nix as text. Every expectation is derived from the file itself: the
// runner's user, workDir, extraPackages and XDG_DATA_HOME are read from the runner block, then:
//
//  workdir       the workDir path has a tmpfiles "d <path> <mode> <runner user> ..." rule. The
//                github-runner module bind-mounts and chdirs into workDir without a "-" prefix and
//                never creates it, so without the rule the unit fails at namespace setup.
//  podman-store  when extraPackages carries podman: XDG_DATA_HOME is set to a path outside workDir
//                (the module wipes workDir on every start and sets HOME to it), that path has a
//                tmpfiles rule owned by the runner user, and serviceOverrides.ReadWritePaths names it
//                (ProtectSystem=strict leaves /var/lib read-only).
//  sandbox       when extraPackages carries podman: serviceOverrides sets RestrictNamespaces,
//                PrivateUsers and NoNewPrivileges to false (rootless podman needs a user namespace
//                and the setuid newuidmap/newgidmap), and a SystemCallFilter override is wrapped in
//                lib.mkForce (serviceOverrides is merged, so a plain list is appended to the module's
//                deny list) and denies none of @mount, capset or sethostname.
//  no-libvirt    the runner user is not in the libvirtd group and the runner's environment carries no
//                LIBVIRT_DEFAULT_URI: management access to qemu:///system is root-equivalent, and the
//                runner runs third-party build code.
//
// Usage: node scripts/verify-legion-runner-unit.mjs [--self-test]
// Honestly --quick: one text read; no nix, no network. The unit itself is proven only by its first
// deployment on legion. The self-test plants each fault in memory and requires red naming it.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'legion-runner-unit';
const UNIT_REL = 'systemd/legion-pb.nix';

/** The text with `#` comments removed (the file carries no `#` inside a string). */
function stripComments(text) {
    return text.split('\n').map((l) => l.replace(/(^|\s)#.*$/, '$1')).join('\n');
}

/** The body of the first `<name> = {` attribute set, by brace matching. */
function block(text, opener) {
    const i = text.indexOf(opener);
    if (i < 0) return null;
    let depth = 0;
    for (let j = text.indexOf('{', i); j < text.length; j++) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}' && --depth === 0) return text.slice(i, j + 1);
    }
    return null;
}

const str = (body, key) => body?.match(new RegExp(`\\b${key}\\s*=\\s*"([^"]*)"`))?.[1] ?? null;

export function drift(rawText) {
    const fails = [];
    const text = stripComments(rawText);
    const runner = block(text, 'services.github-runners.');
    if (!runner) return [`${UNIT_REL} declares no services.github-runners.<name> block`];
    const user = str(runner, 'user');
    const workDir = str(runner, 'workDir');
    if (!user || !workDir) return [`the runner block sets no user or no workDir`];
    const tmpfiles = [...text.matchAll(/"d\s+(\S+)\s+\d+\s+(\S+)\s+(\S+)\s+-"/g)].map((m) => ({ path: m[1], owner: m[2] }));
    const ruleFor = (p) => tmpfiles.find((r) => r.path === p);

    // workdir
    const wr = ruleFor(workDir);
    if (!wr) fails.push(`workdir: no tmpfiles rule creates the runner's workDir ${workDir}`);
    else if (wr.owner !== user) fails.push(`workdir: the tmpfiles rule for ${workDir} is owned by ${wr.owner}, not the runner user ${user}`);

    const pkgs = runner.match(/extraPackages\s*=[^\[]*\[([^\]]*)\]/)?.[1]?.split(/\s+/).filter(Boolean) ?? [];
    const overrides = block(runner, 'serviceOverrides');
    if (pkgs.includes('podman')) {
        // podman-store
        const data = str(runner, 'XDG_DATA_HOME');
        if (!data) fails.push('podman-store: the runner carries podman but sets no XDG_DATA_HOME, so its image store sits in the wiped workDir');
        else {
            if (data === workDir || data.startsWith(`${workDir}/`)) fails.push(`podman-store: XDG_DATA_HOME ${data} is inside workDir ${workDir}, which the module wipes on every start`);
            const dr = ruleFor(data);
            if (!dr || dr.owner !== user) fails.push(`podman-store: no tmpfiles rule owned by ${user} creates XDG_DATA_HOME ${data}`);
            const rw = overrides?.match(/ReadWritePaths\s*=\s*\[([^\]]*)\]/)?.[1] ?? '';
            if (!rw.includes(`"${data}"`)) fails.push(`podman-store: serviceOverrides.ReadWritePaths does not name ${data}; ProtectSystem=strict leaves it read-only`);
        }
        // sandbox
        if (!overrides) fails.push('sandbox: the runner carries podman but sets no serviceOverrides; the module defaults forbid rootless podman');
        else {
            for (const k of ['RestrictNamespaces', 'PrivateUsers', 'NoNewPrivileges']) {
                if (!new RegExp(`\\b${k}\\s*=\\s*false\\s*;`).test(overrides)) fails.push(`sandbox: serviceOverrides does not set ${k} = false; rootless podman cannot start under the module default`);
            }
            const scf = overrides.match(/SystemCallFilter\s*=\s*([^\[;]*)\[([^\]]*)\]/);
            if (scf) {
                if (scf[1].trim() !== 'lib.mkForce') fails.push('sandbox: the SystemCallFilter override is not wrapped in lib.mkForce, so the module deny list (~@mount, ~capset) stays in force');
                for (const deny of ['~@mount', '~capset', '~sethostname']) if (scf[2].includes(`"${deny}"`)) fails.push(`sandbox: the SystemCallFilter override still denies ${deny.slice(1)}, which rootless podman needs`);
            } else fails.push('sandbox: serviceOverrides leaves the module SystemCallFilter, which denies @mount and capset');
        }
    }

    // no-libvirt
    const userBlock = block(text, `users.users.${user}`);
    if (userBlock && /"libvirtd"/.test(userBlock)) fails.push(`no-libvirt: the runner user ${user} is in the libvirtd group (root-equivalent on the host)`);
    if (/LIBVIRT_DEFAULT_URI/.test(runner)) fails.push('no-libvirt: the runner environment sets LIBVIRT_DEFAULT_URI; no workflow job uses libvirt');
    return fails;
}

function report(fails, label) {
    if (fails.length) {
        console.error(`${NAME}: FAIL -- ${label}`);
        for (const f of fails) console.error(`  ${f}`);
        console.error(`  Next step: correct ${UNIT_REL} (see the header comment of this check), then rerun.`);
        return false;
    }
    console.log(`${NAME}: PASS -- ${label}`);
    return true;
}

function selfTest(real) {
    const plants = [
        { name: 'workDir rule removed', naming: 'workdir: no tmpfiles rule', edit: (t) => t.replace(/\s*"d \/var\/lib\/pb-runner 0750[^"]*"/, '') },
        { name: 'workDir rule owned by root', naming: 'owned by root', edit: (t) => t.replace('"d /var/lib/pb-runner 0750 pb-runner', '"d /var/lib/pb-runner 0750 root') },
        { name: 'no XDG_DATA_HOME', naming: 'sets no XDG_DATA_HOME', edit: (t) => t.replace(/XDG_DATA_HOME\s*=\s*"[^"]*";/, '') },
        { name: 'store inside workDir', naming: 'is inside workDir', edit: (t) => t.replace('XDG_DATA_HOME = "/var/lib/pb-runner-data"', 'XDG_DATA_HOME = "/var/lib/pb-runner/data"') },
        { name: 'ReadWritePaths dropped', naming: 'ReadWritePaths does not name', edit: (t) => t.replace(/ReadWritePaths\s*=\s*\[[^\]]*\];/, '') },
        { name: 'RestrictNamespaces left true', naming: 'does not set RestrictNamespaces = false', edit: (t) => t.replace('RestrictNamespaces = false;', 'RestrictNamespaces = true;') },
        { name: 'no mkForce (CR-02 verifier warning)', naming: 'not wrapped in lib.mkForce', edit: (t) => t.replace('lib.mkForce [', '[') },
        { name: '~@mount kept', naming: 'still denies @mount', edit: (t) => t.replace('"~@clock"', '"~@clock" "~@mount"') },
        { name: 'no serviceOverrides (pre-fix)', naming: 'sets no serviceOverrides', edit: (t) => t.replace('serviceOverrides = {', 'unusedOverrides = {') },
        { name: 'runner in libvirtd (pre-fix)', naming: 'is in the libvirtd group', edit: (t) => t.replace('autoSubUidGidRange = true;', 'autoSubUidGidRange = true; extraGroups = [ "libvirtd" ];') },
        { name: 'LIBVIRT_DEFAULT_URI back', naming: 'sets LIBVIRT_DEFAULT_URI', edit: (t) => t.replace('XDG_DATA_HOME =', 'LIBVIRT_DEFAULT_URI = "qemu:///system"; XDG_DATA_HOME =') },
    ];
    let ok = drift(real).length === 0;
    if (!ok) console.error(`${NAME}: self-test FAIL -- the real ${UNIT_REL} is not clean: ${drift(real).join('; ')}`);
    for (const p of plants) {
        const planted = p.edit(real);
        if (planted === real) { console.error(`${NAME}: self-test FAIL -- plant '${p.name}' did not change the text`); ok = false; continue; }
        const f = drift(planted);
        if (!f.some((x) => x.includes(p.naming))) { console.error(`${NAME}: self-test FAIL -- plant '${p.name}' was not red naming '${p.naming}' (got: ${f.join('; ') || 'PASS'})`); ok = false; }
    }
    if (ok) console.log(`${NAME}: self-test PASS -- clean unit green, ${plants.length} plants each red naming the drift`);
    return ok;
}

const real = readFileSync(join(REPO_ROOT, UNIT_REL), 'utf8');
const ok = process.argv.includes('--self-test') ? selfTest(real) : report(drift(real), `${UNIT_REL}: workdir, podman-store, sandbox and no-libvirt rules hold`);
process.exit(ok ? 0 : 1);
