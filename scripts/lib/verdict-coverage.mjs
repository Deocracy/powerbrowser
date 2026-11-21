// scripts/lib/verdict-coverage.mjs
//
// Audit harness-live-security-07: a planted fault per assertion, derived rather than hand-kept. failMessages reads the
// string and template literals of a verdict function's own source, each one by its place in the source and with its
// full static skeleton (the static parts in order, each ${...} hole a wildcard). uncoveredMessages names every message
// for which no single plant produced a fail line matching that whole skeleton. A live row's self-test runs its plants,
// then requires uncoveredMessages(...) to be empty, so a new assertion with no plant, or a plant deleted, turns the
// self-test red naming the message, even when another message shares most of its words.
//
// A message is a literal whose static text is at least MIN_TEXT characters and holds two words; short tokens (state
// words, codes, selectors, flags) are not messages. Literals are never merged: two literals with the same text in two
// places are two messages. No top-level side effects.

const MIN_TEXT = 12;

function unescape(s) {
    return s.replace(/\\(['"`\\nt$])/g, (m, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
}

/** The literals of JavaScript source `src`, in source order: [{ at, parts }] (parts: the static runs; one for a string). */
export function literalsOf(src) {
    const out = [];
    let i = 0;
    const scanCode = (stopAtBrace) => {
        let depth = 0;
        while (i < src.length) {
            const c = src[i];
            if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
            if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
            if (c === '"' || c === "'") { scanQuoted(c); continue; }
            if (c === '`') { scanTemplate(); continue; }
            if (c === '{') depth++;
            if (c === '}') { if (stopAtBrace && depth === 0) { i++; return; } depth--; }
            i++;
        }
    };
    const scanQuoted = (q) => {
        const at = i;
        const start = ++i;
        while (i < src.length && src[i] !== q && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1;
        out.push({ at, parts: [unescape(src.slice(start, i))] });
        i++;
    };
    const scanTemplate = () => {
        const at = i;
        const slot = out.push(null) - 1; // keep source order: the template before the literals in its holes
        i++;
        const parts = [];
        let cur = '';
        while (i < src.length && src[i] !== '`') {
            if (src[i] === '\\') { cur += src.slice(i, i + 2); i += 2; continue; }
            if (src[i] === '$' && src[i + 1] === '{') { parts.push(cur); cur = ''; i += 2; scanCode(true); continue; }
            cur += src[i++];
        }
        parts.push(cur);
        i++;
        out[slot] = { at, parts: parts.map(unescape) };
    };
    scanCode(false);
    return out;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The fail messages of each function in `fns`: [{ fn, at, text, re }]. text shows the skeleton (holes as …); re
 * matches a line holding every static part, in order, with anything in the holes.
 */
export function failMessages(fns) {
    const out = [];
    for (const fn of fns) {
        for (const { at, parts } of literalsOf(fn.toString())) {
            const statics = parts.join(' ').trim();
            const words = statics.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).length;
            if (statics.length < MIN_TEXT || words < 2) continue;
            out.push({ fn: fn.name, at, text: parts.join('…'), re: new RegExp(parts.map(escapeRe).join('.*?')) });
        }
    }
    return out;
}

/**
 * The messages of `fns` that no single plant's output matches. plantOutputs: one array of fail lines per plant (a flat
 * array of lines is read as one plant per line).
 */
export function uncoveredMessages(fns, plantOutputs) {
    const plants = plantOutputs.map((p) => (Array.isArray(p) ? p : [p]));
    return failMessages(fns).filter((m) => !plants.some((lines) => lines.some((line) => m.re.test(line))));
}
