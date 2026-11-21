// scripts/lib/verdict-coverage.mjs
//
// Audit harness-live-security-07: a planted fault per assertion, derived rather than hand-kept. failMessages reads the
// string and template literals of a verdict function's own source; uncoveredMessages names each one no planted fault's
// fail lines contain. A live row's self-test runs its plants, then requires uncoveredMessages(...) to be empty, so a
// new assertion with no plant, or a plant deleted, turns the self-test red naming the message.
//
// A message is a literal whose longest static run (the text between ${...} holes) is at least MIN_TEXT characters and
// holds two words; short tokens (state words, codes, selectors, flags) are not messages. No top-level side effects.

const MIN_TEXT = 12;

function unescape(s) {
    return s.replace(/\\(['"`\\nt$])/g, (m, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
}

/** The literals of JavaScript source `src`: [{ text, longest }], template holes scanned for nested literals. */
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
        const start = ++i;
        while (i < src.length && src[i] !== q && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1;
        const text = unescape(src.slice(start, i));
        out.push({ text, longest: text });
        i++;
    };
    const scanTemplate = () => {
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
        const statics = parts.map(unescape);
        out.push({ text: statics.join('…'), longest: statics.reduce((a, b) => (b.length > a.length ? b : a), '') });
    };
    scanCode(false);
    return out;
}

/** The fail-message texts of each function in `fns`: [{ fn, text }] with text the longest static run, trimmed. */
export function failMessages(fns) {
    const seen = new Set();
    const out = [];
    for (const fn of fns) {
        for (const { longest } of literalsOf(fn.toString())) {
            const text = longest.trim();
            // A message holds at least two words (a token starting with a letter); `--bridge-dir '` and the like do not.
            const words = text.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).length;
            if (text.length < MIN_TEXT || words < 2 || seen.has(text)) continue;
            seen.add(text);
            out.push({ fn: fn.name, text });
        }
    }
    return out;
}

/** The messages of `fns` that no line in `plantedFails` (every fail line the plants produced) contains. */
export function uncoveredMessages(fns, plantedFails) {
    const all = plantedFails.join('\n');
    return failMessages(fns).filter((m) => !all.includes(m.text));
}
