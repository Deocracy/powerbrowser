// scripts/lib/mozlz4.mjs
//
// Phase 67 (RUN-07, P67-10): Gecko's mozlz4 container, read for the session
// restore collector in scripts/lib/orca-offer-scan.mjs. Layout: the 8-byte
// magic "mozLz40\0", a 4-byte little-endian decompressed size, then one LZ4
// block (no frame header, no checksum).
//
// encodeMozLz4Literal writes a valid file holding one literal-only sequence;
// it exists for fixtures and compresses nothing.

const MAGIC = Buffer.from('mozLz40\0', 'latin1');
const HEADER = MAGIC.length + 4;

/** The decompressed bytes of a mozlz4 file. Throws on a bad magic, an out-of-range offset or a size mismatch. */
export function decodeMozLz4(buffer) {
    const src = Buffer.from(buffer);
    if (src.length < HEADER || !src.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('mozlz4: bad magic');
    const out = Buffer.alloc(src.readUInt32LE(MAGIC.length));
    let i = HEADER;
    let o = 0;
    const length = (n) => {
        if (n !== 15) return n;
        for (;;) {
            if (i >= src.length) throw new Error('mozlz4: truncated length');
            const b = src[i++];
            n += b;
            if (b !== 255) return n;
        }
    };
    while (i < src.length) {
        const token = src[i++];
        const lit = length(token >> 4);
        if (i + lit > src.length || o + lit > out.length) throw new Error('mozlz4: literal run past the end');
        src.copy(out, o, i, i + lit);
        i += lit;
        o += lit;
        if (i >= src.length) break; // the last sequence is literals only
        if (i + 2 > src.length) throw new Error('mozlz4: truncated offset');
        const offset = src.readUInt16LE(i);
        i += 2;
        if (offset === 0 || offset > o) throw new Error('mozlz4: match offset out of range');
        const len = length(token & 15) + 4;
        if (o + len > out.length) throw new Error('mozlz4: match past the declared size');
        for (let k = 0; k < len; k++, o++) out[o] = out[o - offset]; // byte by byte: a match may overlap itself
    }
    if (o !== out.length) throw new Error('mozlz4: size mismatch');
    return out;
}

/** A mozlz4 file holding `buffer` as one literal-only sequence (fixtures only). */
export function encodeMozLz4Literal(buffer) {
    const data = Buffer.from(buffer);
    const ext = [];
    if (data.length >= 15) {
        let rest = data.length - 15;
        for (; rest >= 255; rest -= 255) ext.push(255);
        ext.push(rest);
    }
    const size = Buffer.alloc(4);
    size.writeUInt32LE(data.length);
    return Buffer.concat([MAGIC, size, Buffer.from([Math.min(data.length, 15) << 4, ...ext]), data]);
}
