#!/usr/bin/env node
// scripts/verify-legion-runner-unit.mjs
//
// The legion-runner-unit row (audit-fix G5b: 59-CR-01, 59-CR-02, packaging-prefs-network-01).
// Reads systemd/legion-pb.nix as text, and the github-runner module source on this host
// (service.nix of the nixos channel, or $PB_RUNNER_MODULE) for the module's hardening defaults.
//
//  workdir       the runner's workDir has a tmpfiles "d <path> <mode> <runner user> ..." rule. The
//                module bind-mounts and chdirs into workDir without a "-" prefix and never creates it.
//  podman-store  when extraPackages carries podman: XDG_DATA_HOME is set outside workDir (the module
//                wipes workDir on every start and sets HOME to it), has a tmpfiles rule owned by the
//                runner user, and is in serviceOverrides.ReadWritePaths (ProtectSystem=strict).
//  merge         an override of a setting the module defines with lib.mkBefore is wrapped in
//                lib.mkForce (serviceOverrides is merged, so a plain list is appended to the module's).
//  sandbox       (derived; needs the module source) the module's mkDefault and mkBefore hardening
//                values are parsed from service.nix. Each one that blocks rootless podman, by the
//                BLOCKERS rules below, must be overridden as that rule requires; every serviceOverrides
//                key other than ReadWritePaths must be one of those blockers and the module default
//                must block (an override nothing needs is red). The rules describe what the podman
//                calls in .github/workflows/release.yml (podman build --pull=always, podman run -v ...,
//                no --network: pasta) need, not a copy of the module.
//  no-libvirt    the runner user is not in libvirtd and the runner sets no LIBVIRT_DEFAULT_URI.
//
// Usage: node scripts/verify-legion-runner-unit.mjs [--self-test]
// Exit 77 after one SKIP line when the module source is absent (the sandbox clause did not run).
// The unit itself is proven only by its first deployment on legion.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verdictExit } from './lib/skip-verdict.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'legion-runner-unit';
const UNIT_REL = 'systemd/legion-pb.nix';
const MODULE = process.env.PB_RUNNER_MODULE
    ?? ['/nix/var/nix/profiles/per-user/root/channels/nixos/nixos/modules/services/continuous-integration', 'github-runner', 'service.nix'].join('/');

// What rootless podman needs from each module default that blocks it. blocks(v, mod) says whether the
// module's value blocks; ok(o) checks the override o ({ force, value }).
const tokens = (list) => (list ?? []).flatMap((e) => e.split(/\s+/)).filter(Boolean);
const isFalse = (o) => o?.value === false;
export const BLOCKERS = {
    RestrictNamespaces: { why: 'podman creates user, mount and network namespaces', blocks: (v) => v === true, ok: isFalse, want: 'false' },
    PrivateUsers: { why: 'newuidmap maps the subordinate ranges, absent from a private user namespace', blocks: (v) => v === true, ok: isFalse, want: 'false' },
    NoNewPrivileges: { why: 'newuidmap and newgidmap are setuid', blocks: (v) => v === true, ok: isFalse, want: 'false' },
    PrivateDevices: { why: 'the private /dev lacks /dev/fuse and /dev/net/tun', blocks: (v) => v === true, ok: isFalse, want: 'false' },
    RestrictSUIDSGID: { why: 'unpacking image layers recreates setuid files', blocks: (v) => v === true, ok: isFalse, want: 'false' },
    ProtectHostname: { why: 'crun calls sethostname in the container UTS namespace', blocks: (v) => v === true, ok: isFalse, want: 'false' },
    ProtectKernelTunables: { why: 'its locked /proc over-mounts make the kernel refuse the container procfs mount', blocks: (v) => v === true, ok: isFalse, want: 'false' },
    ProtectKernelLogs: { why: 'its /proc/kmsg over-mount makes the kernel refuse the container procfs mount', blocks: (v) => v === true, ok: isFalse, want: 'false' },
    CapabilityBoundingSet: {
        why: 'the setuid id-map helpers need CAP_SETUID and CAP_SETGID',
        blocks: (v) => !['CAP_SETUID', 'CAP_SETGID'].every((c) => tokens(v).includes(c)),
        ok: (o) => o?.force && Array.isArray(o.value) && [...tokens(o.value)].sort().join(' ') === 'CAP_SETGID CAP_SETUID',
        want: 'lib.mkForce [ "CAP_SETUID CAP_SETGID" ] and nothing else',
    },
    DeviceAllow: {
        why: 'a non-empty allow list (ProtectClock implies char-rtc) closes /dev/fuse and /dev/net/tun',
        blocks: (v, mod) => (v !== undefined || mod.get('ProtectClock')?.value === true) && !['/dev/fuse', '/dev/net/tun'].every((d) => (v ?? []).some((e) => e.startsWith(`${d} `))),
        ok: (o) => o?.force && Array.isArray(o.value) && JSON.stringify(o.value) === JSON.stringify(['', '/dev/fuse rw', '/dev/net/tun rw']),
        want: 'lib.mkForce [ "" "/dev/fuse rw" "/dev/net/tun rw" ]',
    },
    SystemCallFilter: {
        why: 'crun needs mount, pivot_root, capset and sethostname',
        drop: ['~@mount', '~capset', '~sethostname'],
        blocks(v) { return (v ?? []).some((e) => this.drop.includes(e)); },
        ok(o, mod) {
            const want = (mod.get('SystemCallFilter')?.value ?? []).filter((e) => !this.drop.includes(e));
            return o?.force && Array.isArray(o.value) && [...o.value].sort().join(',') === [...want].sort().join(',');
        },
        want: 'lib.mkForce [ the module list minus ~@mount, ~capset and ~sethostname ]',
    },
};

/** The text with `#` comments removed (the file carries no `#` inside a string). */
function stripComments(text) {
    return text.split('\n').map((l) => l.replace(/(^|\s)#.*$/, '$1')).join('\n');
}

/** The first `<opener> ... { ... }` attribute set, by brace matching. */
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

function parseValue(raw) {
    const t = raw.trim();
    if (t === 'true' || t === 'false') return t === 'true';
    if (t.startsWith('"')) return JSON.parse(t);
    if (t.startsWith('[')) return [...t.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`));
    return t;
}

/** `Key = <wrapper> value;` entries of a Nix attribute body: Map key -> { wrapper, force, value }. */
export function settings(body) {
    const out = new Map();
    const re = /\b([A-Z][A-Za-z]+)\s*=\s*(lib\.(mkDefault|mkBefore|mkForce)\s+)?(\[[^\]]*\]|"[^"]*"|true|false)\s*;/g;
    for (const m of body.matchAll(re)) out.set(m[1], { wrapper: m[3] ?? null, force: m[3] === 'mkForce', value: parseValue(m[4]) });
    return out;
}

/** The module's hardening values: the serviceConfig keys it sets with lib.mkDefault or lib.mkBefore. */
export function moduleDefaults(moduleText) {
    const all = settings(stripComments(moduleText));
    return new Map([...all].filter(([, v]) => v.wrapper === 'mkDefault' || v.wrapper === 'mkBefore'));
}

export function drift(rawText, moduleText) {
    const fails = [];
    const text = stripComments(rawText);
    const runner = block(text, 'services.github-runners.');
    if (!runner) return [`${UNIT_REL} declares no services.github-runners.<name> block`];
    const user = str(runner, 'user');
    const workDir = str(runner, 'workDir');
    if (!user || !workDir) return ['the runner block sets no user or no workDir'];
    const tmpfiles = [...text.matchAll(/"d\s+(\S+)\s+\d+\s+(\S+)\s+(\S+)\s+-"/g)].map((m) => ({ path: m[1], owner: m[2] }));
    const ruleFor = (p) => tmpfiles.find((r) => r.path === p);

    const wr = ruleFor(workDir);
    if (!wr) fails.push(`workdir: no tmpfiles rule creates the runner's workDir ${workDir}`);
    else if (wr.owner !== user) fails.push(`workdir: the tmpfiles rule for ${workDir} is owned by ${wr.owner}, not the runner user ${user}`);

    const pkgs = runner.match(/extraPackages\s*=[^\[]*\[([^\]]*)\]/)?.[1]?.split(/\s+/).filter(Boolean) ?? [];
    const overridesBody = block(runner, 'serviceOverrides');
    const overrides = overridesBody ? settings(overridesBody) : new Map();
    if (pkgs.includes('podman')) {
        const data = str(runner, 'XDG_DATA_HOME');
        if (!data) fails.push('podman-store: the runner carries podman but sets no XDG_DATA_HOME, so its image store sits in the wiped workDir');
        else {
            if (data === workDir || data.startsWith(`${workDir}/`)) fails.push(`podman-store: XDG_DATA_HOME ${data} is inside workDir ${workDir}, which the module wipes on every start`);
            const dr = ruleFor(data);
            if (!dr || dr.owner !== user) fails.push(`podman-store: no tmpfiles rule owned by ${user} creates XDG_DATA_HOME ${data}`);
            if (!(overrides.get('ReadWritePaths')?.value ?? []).includes(data)) fails.push(`podman-store: serviceOverrides.ReadWritePaths does not name ${data}; ProtectSystem=strict leaves it read-only`);
        }
        if (!overridesBody) fails.push('sandbox: the runner carries podman but sets no serviceOverrides; the module defaults forbid rootless podman');
    }

    if (moduleText !== null && pkgs.includes('podman')) {
        const mod = moduleDefaults(moduleText);
        if (mod.size === 0) fails.push('sandbox: no lib.mkDefault or lib.mkBefore hardening value was parsed from the module source; the parser no longer matches it');
        for (const [key, o] of overrides) {
            if (key === 'ReadWritePaths') continue;
            if (mod.get(key)?.wrapper === 'mkBefore' && !o.force) fails.push(`merge: serviceOverrides.${key} is not wrapped in lib.mkForce, so it is appended to the module's mkBefore list`);
            const rule = BLOCKERS[key];
            if (!rule) { fails.push(`sandbox: serviceOverrides.${key} relaxes a setting rootless podman does not need (not a known blocker)`); continue; }
            if (!rule.blocks(mod.get(key)?.value, mod)) fails.push(`sandbox: serviceOverrides.${key} is not needed: the module default (${JSON.stringify(mod.get(key)?.value ?? null)}) does not block rootless podman`);
        }
        for (const [key, rule] of Object.entries(BLOCKERS)) {
            if (!rule.blocks(mod.get(key)?.value, mod)) continue;
            const o = overrides.get(key);
            if (!o) fails.push(`sandbox: the module default ${key} = ${JSON.stringify(mod.get(key)?.value ?? null)} blocks rootless podman (${rule.why}) and serviceOverrides leaves it; want ${rule.want}`);
            else if (!rule.ok(o, mod)) fails.push(`sandbox: serviceOverrides.${key} = ${JSON.stringify(o.value)}${o.force ? ' (mkForce)' : ''} does not give rootless podman what it needs (${rule.why}); want ${rule.want}`);
        }
    } else if (pkgs.includes('podman')) {
        // Without the module the merge rule can still be applied to the list-valued overrides.
        for (const [key, o] of overrides) if (Array.isArray(o.value) && key !== 'ReadWritePaths' && !o.force) fails.push(`merge: serviceOverrides.${key} is a list without lib.mkForce`);
    }

    const userBlock = block(text, `users.users.${user}`);
    if (userBlock && /"libvirtd"/.test(userBlock)) fails.push(`no-libvirt: the runner user ${user} is in the libvirtd group (root-equivalent on the host)`);
    if (/LIBVIRT_DEFAULT_URI/.test(runner)) fails.push('no-libvirt: the runner environment sets LIBVIRT_DEFAULT_URI; no workflow job uses libvirt');
    return fails;
}

function selfTest(real, moduleText) {
    const unitPlants = [
        ['workDir rule removed (59-CR-01 pre-fix)', 'workdir: no tmpfiles rule', (t) => t.replace(/\s*"d \/var\/lib\/pb-runner 0750[^"]*"/, '')],
        ['workDir rule owned by root', 'owned by root', (t) => t.replace('"d /var/lib/pb-runner 0750 pb-runner', '"d /var/lib/pb-runner 0750 root')],
        ['no XDG_DATA_HOME', 'sets no XDG_DATA_HOME', (t) => t.replace(/XDG_DATA_HOME\s*=\s*"[^"]*";/, '')],
        ['store inside workDir', 'is inside workDir', (t) => t.replace('XDG_DATA_HOME = "/var/lib/pb-runner-data"', 'XDG_DATA_HOME = "/var/lib/pb-runner/data"')],
        ['ReadWritePaths dropped', 'ReadWritePaths does not name', (t) => t.replace(/ReadWritePaths\s*=\s*\[[^\]]*\];/, '')],
        ['no serviceOverrides (59-CR-02 pre-fix)', 'sets no serviceOverrides', (t) => t.replace('serviceOverrides = {', 'unusedOverrides = {')],
        ['runner in libvirtd (pre-fix)', 'is in the libvirtd group', (t) => t.replace('autoSubUidGidRange = true;', 'autoSubUidGidRange = true; extraGroups = [ "libvirtd" ];')],
        ['LIBVIRT_DEFAULT_URI back', 'sets LIBVIRT_DEFAULT_URI', (t) => t.replace('XDG_DATA_HOME =', 'LIBVIRT_DEFAULT_URI = "qemu:///system"; XDG_DATA_HOME =')],
    ];
    const modulePlants = [
        ['RestrictNamespaces left true', 'RestrictNamespaces', (t) => t.replace('RestrictNamespaces = false;', 'RestrictNamespaces = true;')],
        ['bounding set not overridden (review a)', 'CapabilityBoundingSet', (t) => t.replace(/CapabilityBoundingSet = lib\.mkForce \[[^\]]*\];/, '')],
        ['bounding set wider than needed', 'CapabilityBoundingSet', (t) => t.replace('"CAP_SETUID CAP_SETGID"', '"CAP_SETUID CAP_SETGID CAP_SYS_ADMIN"')],
        ['no /dev/net/tun (review b)', 'DeviceAllow', (t) => t.replace('"/dev/net/tun rw"', '')],
        ['ProtectKernelTunables kept (review c)', 'ProtectKernelTunables', (t) => t.replace('ProtectKernelTunables = false;', '')],
        ['ProtectKernelLogs kept (review c)', 'ProtectKernelLogs', (t) => t.replace('ProtectKernelLogs = false;', '')],
        ['SystemCallFilter without mkForce (CR-02 verifier)', 'merge: serviceOverrides.SystemCallFilter', (t) => t.replace('SystemCallFilter = lib.mkForce [', 'SystemCallFilter = [')],
        ['~@mount kept', 'SystemCallFilter', (t) => t.replace('"~@clock"', '"~@clock" "~@mount"')],
        ['a module entry dropped from the filter', 'SystemCallFilter', (t) => t.replace('"~setdomainname"', '')],
        ['an override nothing needs (PrivateMounts)', 'PrivateMounts relaxes a setting', (t) => t.replace('ProtectKernelLogs = false;', 'ProtectKernelLogs = false; PrivateMounts = false;')],
    ];
    let ok = true;
    const check = (label, fails, naming) => {
        if (!fails.some((x) => x.includes(naming))) { console.error(`${NAME}: self-test FAIL -- plant '${label}' was not red naming '${naming}' (got: ${fails.join('; ') || 'PASS'})`); ok = false; }
    };
    const base = drift(real, moduleText);
    if (base.length) { console.error(`${NAME}: self-test FAIL -- the real ${UNIT_REL} is not clean: ${base.join('; ')}`); ok = false; }
    for (const [label, naming, edit] of unitPlants) {
        const planted = edit(real);
        if (planted === real) { console.error(`${NAME}: self-test FAIL -- plant '${label}' did not change the text`); ok = false; continue; }
        check(label, drift(planted, moduleText), naming);
    }
    let n = unitPlants.length;
    if (moduleText !== null) {
        for (const [label, naming, edit] of modulePlants) {
            const planted = edit(real);
            if (planted === real) { console.error(`${NAME}: self-test FAIL -- plant '${label}' did not change the text`); ok = false; continue; }
            check(label, drift(planted, moduleText), naming);
        }
        // Module-side plant: a default the module no longer sets makes its override unneeded.
        check('module drops ProtectKernelLogs', drift(real, moduleText.replace(/ProtectKernelLogs = lib\.mkDefault true;/, '')), 'ProtectKernelLogs is not needed');
        check('module adds a deny entry the unit drops', drift(real, moduleText.replace('"~@mount"', '"~@mount"\n              "~@keyring"')), 'SystemCallFilter');
        n += modulePlants.length + 2;
    }
    if (ok) console.log(`${NAME}: self-test PASS -- the real unit is green, ${n} plants each red naming the drift`);
    return ok;
}

const real = readFileSync(join(REPO_ROOT, UNIT_REL), 'utf8');
const moduleText = existsSync(MODULE) ? readFileSync(MODULE, 'utf8') : null;
const skips = moduleText === null ? [`the sandbox clause did not run: the github-runner module source ${MODULE} is absent (set PB_RUNNER_MODULE to a nixos channel's service.nix)`] : [];
let code;
if (process.argv.includes('--self-test')) code = selfTest(real, moduleText) ? verdictExit(`${NAME} self-test`, [], skips) : 1;
else {
    const fails = drift(real, moduleText);
    for (const f of fails) console.error(`${NAME}: FAIL -- ${f}`);
    if (fails.length) console.error(`  Next step: correct ${UNIT_REL} (see the header comment of this check), then rerun.`);
    code = verdictExit(NAME, fails, skips);
    if (code === 0) console.log(`${NAME}: PASS -- ${UNIT_REL}: workdir, podman-store, merge, sandbox (derived from ${MODULE}) and no-libvirt rules hold`);
}
process.exit(code);
