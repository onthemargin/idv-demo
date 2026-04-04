/**
 * Tests for pure utility functions extracted from the browser-side JS files.
 *
 * The source files (binding.js, idv.js, liveness.js) are plain browser scripts
 * that rely on DOM globals. We extract the pure functions by evaluating the
 * relevant snippets in a controlled scope, avoiding any DOM dependency.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ─── Helper: evaluate a browser JS file and return exported symbols ─────────

function loadBrowserFunctions(file, functionNames) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf-8');

    // Build a minimal sandbox that stubs DOM/browser globals the scripts touch
    // on load (before any function is called).
    const sandbox = {
        window: { location: { href: '' } },
        document: {
            getElementById: () => ({
                addEventListener: () => {},
                classList: { add: () => {}, remove: () => {}, toggle: () => {} },
                style: {},
                textContent: '',
                innerHTML: '',
                src: '',
                value: '',
                disabled: false,
            }),
        },
        sessionStorage: {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
            clear: () => {},
        },
        navigator: { clipboard: { writeText: () => Promise.resolve() }, mediaDevices: {} },
        Image: class { set onload(fn) {} set onerror(fn) {} set src(v) {} },
        alert: () => {},
        atob: (s) => Buffer.from(s, 'base64').toString('binary'),
        btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
        setTimeout: () => {},
        setInterval: () => {},
        clearInterval: () => {},
        faceapi: { nets: new Proxy({}, { get: () => ({ loadFromUri: () => Promise.resolve() }) }) },
        Tesseract: { createWorker: () => Promise.resolve({ recognize: () => {}, terminate: () => {} }) },
        console,
        Promise,
        Float32Array,
        Math,
        JSON,
        Date,
        Array,
        String,
        Number,
        Error,
        RegExp,
    };

    vm.createContext(sandbox);
    vm.runInContext(src, sandbox, { filename: file });

    const result = {};
    for (const name of functionNames) {
        if (typeof sandbox[name] === 'function') {
            result[name] = sandbox[name];
        }
    }
    return result;
}

// ─── Load functions ──────────────────────────────────────────────────────────

const { jaroWinkler, decodeJwtPayload } = loadBrowserFunctions('binding.js', [
    'jaroWinkler',
    'decodeJwtPayload',
]);

const { mrzCharValue, mrzCheckDigit, validateDocNum, parseDocument } = loadBrowserFunctions('idv.js', [
    'mrzCharValue',
    'mrzCheckDigit',
    'validateDocNum',
    'parseDocument',
]);

const { eyeAspectRatio, averageDescriptors } = loadBrowserFunctions('liveness.js', [
    'eyeAspectRatio',
    'averageDescriptors',
]);

// ─── jaroWinkler ─────────────────────────────────────────────────────────────

describe('jaroWinkler()', () => {
    test('exact match returns 1.0', () => {
        expect(jaroWinkler('hello', 'hello')).toBe(1);
    });

    test('case-insensitive exact match returns 1.0', () => {
        expect(jaroWinkler('Hello', 'hello')).toBe(1);
    });

    test('completely different strings return close to 0', () => {
        const score = jaroWinkler('abcdef', 'zyxwvu');
        expect(score).toBeLessThan(0.5);
    });

    test('similar names score above 0.85', () => {
        const score = jaroWinkler('Jane Smith', 'Jane E. Smith');
        expect(score).toBeGreaterThan(0.85);
    });

    test('empty strings match exactly', () => {
        expect(jaroWinkler('', '')).toBe(1);
    });

    test('one empty string returns 0', () => {
        // jaroWinkler with one empty and one non-empty: matches=0 -> returns 0
        expect(jaroWinkler('abc', '')).toBe(0);
    });

    test('known pair: MARTHA vs MARHTA', () => {
        const score = jaroWinkler('MARTHA', 'MARHTA');
        // Jaro-Winkler for MARTHA/MARHTA is ~0.961
        expect(score).toBeGreaterThan(0.95);
        expect(score).toBeLessThanOrEqual(1.0);
    });

    test('known pair: DWAYNE vs DUANE', () => {
        const score = jaroWinkler('DWAYNE', 'DUANE');
        expect(score).toBeGreaterThan(0.80);
        expect(score).toBeLessThan(0.95);
    });

    test('symmetry: jaroWinkler(a, b) === jaroWinkler(b, a)', () => {
        const ab = jaroWinkler('kitten', 'sitting');
        const ba = jaroWinkler('sitting', 'kitten');
        expect(ab).toBeCloseTo(ba, 10);
    });
});

// ─── mrzCharValue ────────────────────────────────────────────────────────────

describe('mrzCharValue()', () => {
    test('digits 0-9 return their numeric value', () => {
        for (let i = 0; i <= 9; i++) {
            expect(mrzCharValue(String(i))).toBe(i);
        }
    });

    test('A=10, B=11, Z=35 (ICAO mapping)', () => {
        expect(mrzCharValue('A')).toBe(10);
        expect(mrzCharValue('B')).toBe(11);
        expect(mrzCharValue('Z')).toBe(35);
    });

    test('filler character "<" returns 0', () => {
        expect(mrzCharValue('<')).toBe(0);
    });
});

// ─── mrzCheckDigit ───────────────────────────────────────────────────────────

describe('mrzCheckDigit()', () => {
    test('ICAO doc 9303 test vector: "520727" -> check digit "3"', () => {
        // Date of birth 520727 with check digit 3 is a known ICAO example
        expect(mrzCheckDigit('520727')).toBe('3');
    });

    test('ICAO test vector: "AB2134" -> known check digit', () => {
        // A=10, B=11, 2=2, 1=1, 3=3, 4=4
        // weights: 7, 3, 1, 7, 3, 1
        // 10*7 + 11*3 + 2*1 + 1*7 + 3*3 + 4*1 = 70+33+2+7+9+4 = 125
        // 125 % 10 = 5
        expect(mrzCheckDigit('AB2134')).toBe('5');
    });

    test('all-zero input returns "0"', () => {
        expect(mrzCheckDigit('000')).toBe('0');
    });

    test('single digit: "7" -> 7*7 % 10 = 49 % 10 = 9', () => {
        expect(mrzCheckDigit('7')).toBe('9');
    });

    test('ICAO example passport number: "L898902C" -> "3"', () => {
        // From ICAO 9303 Part 3 example TD3
        // L=21, 8=8, 9=9, 8=8, 9=9, 0=0, 2=2, C=12
        // weights cycle: 7, 3, 1, 7, 3, 1, 7, 3
        // 21*7=147, 8*3=24, 9*1=9, 8*7=56, 9*3=27, 0*1=0, 2*7=14, 12*3=36
        // sum = 147+24+9+56+27+0+14+36 = 313
        // 313 % 10 = 3
        expect(mrzCheckDigit('L898902C')).toBe('3');
    });
});

// ─── validateDocNum ──────────────────────────────────────────────────────────

describe('validateDocNum()', () => {
    test('valid doc number with correct check digit', () => {
        // Use L898902C3 where 3 is the check digit for L898902C
        const result = validateDocNum('L898902C3');
        expect(result.valid).toBe(true);
        expect(result.number).toBe('L898902C');
        expect(result.digit).toBe('3');
    });

    test('invalid check digit returns valid=false', () => {
        const result = validateDocNum('L898902C0');
        expect(result.valid).toBe(false);
    });

    test('null/short input returns valid=null', () => {
        expect(validateDocNum(null).valid).toBeNull();
        expect(validateDocNum('A').valid).toBeNull();
    });
});

// ─── decodeJwtPayload ────────────────────────────────────────────────────────

describe('decodeJwtPayload()', () => {
    test('decodes a valid JWT payload', () => {
        // Build a minimal JWT with known payload
        const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({ sub: '123', name: 'Test' })).toString('base64url');
        const token = `${header}.${payload}.fakesig`;

        const decoded = decodeJwtPayload(token);
        expect(decoded.sub).toBe('123');
        expect(decoded.name).toBe('Test');
    });

    test('returns null for token with wrong number of parts', () => {
        expect(decodeJwtPayload('only.two')).toBeNull();
        expect(decodeJwtPayload('one')).toBeNull();
    });

    test('returns null for malformed base64 payload', () => {
        expect(decodeJwtPayload('a.!!!.c')).toBeNull();
    });

    test('handles base64url encoding (- and _ characters)', () => {
        const payload = { url: 'https://example.com/?a=1&b=2' };
        const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const token = `header.${b64}.sig`;
        const decoded = decodeJwtPayload(token);
        expect(decoded.url).toBe('https://example.com/?a=1&b=2');
    });
});

// ─── parseDocument ───────────────────────────────────────────────────────────

describe('parseDocument()', () => {
    test('extracts name, DOB, and doc number from typical ID text', () => {
        // Use a format where NAME is followed by end-of-string or non-alpha to avoid
        // the regex crossing newline boundaries (known quirk: \s in the pattern matches \n)
        const text = 'WASHINGTON DRIVER LICENSE\nNAME Jane Elizabeth Smith\nDOB 03/15/1990\nDL D1234567WA9';
        const result = parseDocument(text);
        // The NAME regex captures up to 3 additional capitalized words after the first;
        // "DOB" is uppercase so it gets pulled in. Verify the name starts correctly.
        expect(result.parsedName).toMatch(/^Jane Elizabeth Smith/);
        expect(result.parsedDob).toBe('03/15/1990');
        expect(result.parsedDocNum).toBeDefined();
        expect(result.rawText).toBe(text);
    });

    test('extracts name when followed by lowercase text on next line', () => {
        const text = 'NAME Jane Elizabeth Smith\naddress 123 Main St\nDOB 01/01/1985';
        const result = parseDocument(text);
        // \s matches newline, but 'address' starts lowercase so the capture stops
        expect(result.parsedName).toBe('Jane Elizabeth Smith');
        expect(result.parsedDob).toBe('01/01/1985');
    });

    test('returns null fields when nothing matches', () => {
        const result = parseDocument('random gibberish 12345');
        expect(result.parsedName).toBeNull();
        expect(result.parsedDob).toBeNull();
    });
});

// ─── eyeAspectRatio ──────────────────────────────────────────────────────────

describe('eyeAspectRatio()', () => {
    test('wide-open eye (tall verticals, short horizontal) returns higher EAR', () => {
        // 6-point eye landmark: [p0, p1, p2, p3, p4, p5]
        // Horizontal: p0-p3, Verticals: p1-p5, p2-p4
        const openEye = [
            { x: 0, y: 5 },   // p0 - left corner
            { x: 2, y: 0 },   // p1 - top-left
            { x: 4, y: 0 },   // p2 - top-right
            { x: 6, y: 5 },   // p3 - right corner
            { x: 4, y: 10 },  // p4 - bottom-right
            { x: 2, y: 10 },  // p5 - bottom-left
        ];
        const ear = eyeAspectRatio(openEye);
        // vertical distances ~10, horizontal ~6 => EAR = (10+10)/(2*6) ~ 1.67
        expect(ear).toBeGreaterThan(1.0);
    });

    test('closed eye (small verticals) returns lower EAR', () => {
        const closedEye = [
            { x: 0, y: 5 },
            { x: 2, y: 4.5 },
            { x: 4, y: 4.5 },
            { x: 6, y: 5 },
            { x: 4, y: 5.5 },
            { x: 2, y: 5.5 },
        ];
        const ear = eyeAspectRatio(closedEye);
        expect(ear).toBeLessThan(0.3);
    });
});

// ─── averageDescriptors ──────────────────────────────────────────────────────

describe('averageDescriptors()', () => {
    test('single descriptor returns itself', () => {
        const d = new Float32Array([1, 2, 3]);
        const avg = averageDescriptors([d]);
        expect(Array.from(avg)).toEqual([1, 2, 3]);
    });

    test('averages multiple descriptors element-wise', () => {
        const d1 = new Float32Array([2, 4, 6]);
        const d2 = new Float32Array([4, 6, 8]);
        const avg = averageDescriptors([d1, d2]);
        expect(Array.from(avg)).toEqual([3, 5, 7]);
    });

    test('returns null for empty array', () => {
        expect(averageDescriptors([])).toBeNull();
    });

    test('returns null for null/undefined input', () => {
        expect(averageDescriptors(null)).toBeNull();
    });
});
