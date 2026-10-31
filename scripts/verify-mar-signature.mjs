#!/usr/bin/env node
// scripts/verify-mar-signature.mjs <signed.mar> <certificate.der>
//
// Verifies the one signature of a signed MAR against a DER certificate using node:crypto only.
// sign-publish runs it after `signmar -v` (review BL-01): the signer and this check share no code,
// no library and no binary, so a fault in signmar's verify path cannot vouch for itself.
// Limit, recorded: the byte layout below is read from upstream modules/libmar/verify/mar_verify.c,
// so a misreading of the format by both would pass; the layout is fixed and the self-test pins it.
//
// MAR layout (all integers big-endian): "MAR1", u32 index offset, u64 file size, u32 signature
// count, then per signature u32 algorithm id (2 = RSA PKCS#1 v1.5 over SHA-384), u32 length, the
// signature bytes. The signed bytes are the whole file with the signature bytes themselves removed.
//
//   node scripts/verify-mar-signature.mjs <mar> <der>   exit 0 verified, 1 refused, 2 usage
//   node scripts/verify-mar-signature.mjs --self-test   plants faults in memory; writes nothing

import { createSign, createVerify, generateKeyPairSync, constants, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';

const NAME = 'verify-mar-signature';
const MAX_SIGNATURE = 2048;

// Returns null when the signature verifies, else the reason it does not.
export function checkMar(mar, publicKey) {
    if (mar.length < 20 || mar.toString('latin1', 0, 4) !== 'MAR1') return 'not a MAR file (bad magic)';
    if (mar.readBigUInt64BE(8) !== BigInt(mar.length)) return 'the size field disagrees with the file length';
    const count = mar.readUInt32BE(16);
    if (count !== 1) return `expected exactly 1 signature, found ${count}`;
    const verifier = createVerify('sha384');
    verifier.update(mar.subarray(0, 20));
    const algo = mar.readUInt32BE(20);
    const len = mar.readUInt32BE(24);
    if (algo !== 2) return `unknown signature algorithm id ${algo}`;
    if (len === 0 || len > MAX_SIGNATURE || 28 + len > mar.length) return `signature length ${len} is out of range`;
    verifier.update(mar.subarray(20, 28));
    verifier.update(mar.subarray(28 + len));
    const ok = verifier.verify({ key: publicKey, padding: constants.RSA_PKCS1_PADDING }, mar.subarray(28, 28 + len));
    return ok ? null : 'the signature does not verify against the certificate';
}

function selfTest() {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey;
    const body = Buffer.from('product information block and files');
    const build = (mutate = b => b) => {
        const head = Buffer.alloc(20);
        head.write('MAR1', 0, 'latin1');
        head.writeUInt32BE(28 + 256 + 0, 4);
        head.writeBigUInt64BE(BigInt(28 + 256 + body.length), 8);
        head.writeUInt32BE(1, 16);
        const sigHdr = Buffer.alloc(8);
        sigHdr.writeUInt32BE(2, 0);
        sigHdr.writeUInt32BE(256, 4);
        const s = createSign('sha384');
        s.update(Buffer.concat([head, sigHdr, body]));
        const sig = s.sign({ key: privateKey, padding: constants.RSA_PKCS1_PADDING });
        return mutate(Buffer.concat([head, sigHdr, sig, body]));
    };
    const flip = at => b => { b[at] ^= 1; return b; };
    const cases = [
        ['a correctly signed MAR', build(), publicKey, null],
        ['a flipped data byte', build(b => flip(b.length - 1)(b)), publicKey, 'does not verify'],
        ['a flipped signature byte', build(flip(40)), publicKey, 'does not verify'],
        ['another key', build(), other, 'does not verify'],
        ['an altered algorithm id', build(b => { b.writeUInt32BE(1, 20); return b; }), publicKey, 'unknown signature algorithm'],
        ['zero signatures', build(b => { b.writeUInt32BE(0, 16); return b; }), publicKey, 'exactly 1 signature'],
        ['a truncated file', build().subarray(0, 100), publicKey, 'size field'],
        ['bad magic', build(b => { b.write('XXXX', 0, 'latin1'); return b; }), publicKey, 'bad magic'],
    ];
    let failed = 0;
    for (const [name, mar, key, want] of cases) {
        const got = checkMar(mar, key);
        const ok = want === null ? got === null : got !== null && got.includes(want);
        console.log(`  ${ok ? 'ok ' : 'BAD'} ${name} -> ${got ?? 'verified'}`);
        if (!ok) failed += 1;
    }
    if (failed > 0) {
        console.error(`${NAME}: --self-test FAIL -- ${failed} case(s) did not behave. Next step: fix scripts/verify-mar-signature.mjs.`);
        return 1;
    }
    console.log(`${NAME}: --self-test PASS -- ${cases.length} cases (one good, seven planted faults) behave. It writes nothing.`);
    return 0;
}

const [a, b] = process.argv.slice(2);
if (a === '--self-test') process.exit(selfTest());
if (!a || !b || process.argv.length !== 4) {
    console.error(`${NAME}: FAIL -- usage: node scripts/verify-mar-signature.mjs <signed.mar> <certificate.der>`);
    process.exit(2);
}
let reason;
try {
    reason = checkMar(readFileSync(a), new X509Certificate(readFileSync(b)).publicKey);
} catch (e) {
    reason = `could not be checked (${e.message.split('\n')[0]})`;
}
if (reason !== null) {
    console.error(`${NAME}: FAIL -- ${a}: ${reason}. Next step: nothing is uploaded; re-sign with the tracked key or investigate the MAR.`);
    process.exit(1);
}
console.log(`${NAME}: PASS -- ${a} carries one signature that verifies against ${b} (node:crypto, independent of signmar).`);
