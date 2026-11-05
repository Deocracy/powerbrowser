#!/usr/bin/env node
// scripts/verify-bidi-remote-value.mjs -- every live harness reads script.evaluate results through
// fromRemoteValue (scripts/lib/firefox-bidi.mjs). Before it, evaluate returned the raw RemoteValue's
// .value, so an expression returning an object reached the harness as [key, RemoteValue] pairs and
// every `.field` read was undefined -- found live in the v1.5 end-of-milestone pass. This check runs
// each RemoteValue shape through the decoder; --self-test runs the same cases against that pre-fix
// reader and an identity decoder and requires both to go red naming a shape.

import { deepStrictEqual } from 'node:assert/strict';
import { fromRemoteValue } from './lib/firefox-bidi.mjs';

const num = value => ({ type: 'number', value });
const str = value => ({ type: 'string', value });
const node = { type: 'node', sharedId: 'n1', value: { nodeType: 1, localName: 'browser' } };
const CASES = [
    ['object of primitives', { type: 'object', value: [['has', { type: 'boolean', value: true }], ['tag', str('browser')], ['none', { type: 'null' }]] },
        { has: true, tag: 'browser', none: null }],
    ['nested array and object', { type: 'array', value: [num(1), { type: 'object', value: [['kids', { type: 'array', value: [] }]] }] },
        [1, { kids: [] }]],
    ['special numbers', { type: 'array', value: [num('NaN'), num('-0'), num('Infinity')] }, [NaN, -0, Infinity]],
    ['undefined member', { type: 'object', value: [['u', { type: 'undefined' }]] }, { u: undefined }],
    ['map with a number key', { type: 'map', value: [[num(1), str('one')]] }, { 1: 'one' }],
    ['JSON string unchanged', str('{"a":1}'), '{"a":1}'],
    ['node stays a handle', node, node],
];

function failuresOf(decode) {
    return CASES.flatMap(([name, rv, want]) => {
        try { deepStrictEqual(decode(rv), want); return []; } catch { return [name]; }
    });
}

if (process.argv.includes('--self-test')) {
    const plants = { 'pre-fix .value reader': rv => rv?.value, 'identity decoder': rv => rv };
    const green = Object.entries(plants).filter(([, decode]) => failuresOf(decode).length === 0).map(([name]) => name);
    const control = failuresOf(fromRemoteValue);
    if (control.length || green.length) {
        console.error('verify-bidi-remote-value --self-test: FAIL');
        if (control.length) console.error(`  the clean control is red: ${control.join(', ')}`);
        green.forEach(name => console.error(`  plant '${name}' stayed green`));
        process.exit(1);
    }
    console.log(`verify-bidi-remote-value --self-test: PASS -- ${Object.entries(plants).map(([name, decode]) => `'${name}' red on ${failuresOf(decode).join(', ')}`).join('; ')}`);
} else {
    const failed = failuresOf(fromRemoteValue);
    if (failed.length) {
        console.error(`verify-bidi-remote-value: FAIL -- fromRemoteValue decodes these RemoteValue shapes wrongly: ${failed.join(', ')}`);
        process.exit(1);
    }
    console.log(`verify-bidi-remote-value: PASS -- fromRemoteValue decodes all ${CASES.length} RemoteValue shapes`);
}
