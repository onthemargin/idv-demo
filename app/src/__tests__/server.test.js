const request = require('supertest');

// Set env before requiring server so it does not read a real .env
process.env.SESSION_SECRET = 'test-secret';
process.env.PORT = '0';

const { app, mintVerificationToken } = require('../server');

// ─── mintVerificationToken ──────────────────────────────────────────────────

describe('mintVerificationToken()', () => {
    test('returns a string with three base64url-encoded parts separated by dots', () => {
        const token = mintVerificationToken({ sub: 'u1', name: 'Test' });
        const parts = token.split('.');
        expect(parts).toHaveLength(3);

        // Each part must be valid base64url (alphanumeric, dash, underscore, no padding)
        const b64urlRe = /^[A-Za-z0-9_-]+$/;
        parts.forEach((p) => expect(p).toMatch(b64urlRe));
    });

    test('header decodes to { alg: "HS256", typ: "JWT" }', () => {
        const token = mintVerificationToken({ sub: 'u1' });
        const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
        expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
    });

    test('payload round-trips the input claims', () => {
        const claims = { sub: 'abc', name: 'Jane', iss: 'idv-demo' };
        const token = mintVerificationToken(claims);
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        expect(payload.sub).toBe('abc');
        expect(payload.name).toBe('Jane');
        expect(payload.iss).toBe('idv-demo');
    });

    test('signature changes when payload changes', () => {
        const t1 = mintVerificationToken({ sub: 'a' });
        const t2 = mintVerificationToken({ sub: 'b' });
        expect(t1.split('.')[2]).not.toBe(t2.split('.')[2]);
    });
});

// ─── Persona handlers ───────────────────────────────────────────────────────

describe('POST /idv-demo/api/mock-google', () => {
    test('returns 200 with provider "google" and expected claims', async () => {
        const res = await request(app)
            .post('/idv-demo/api/mock-google')
            .send({});

        expect(res.status).toBe(200);
        expect(res.body.provider).toBe('google');
        expect(res.body.claims.name).toBe('Jane Smith');
        expect(res.body.claims.email).toBe('jane.smith@gmail.com');
        expect(res.body.claims.email_verified).toBe(true);
        expect(res.body.tokenMeta.token_type).toBe('Bearer');
    });

    test('sets iat/exp timestamps close to now', async () => {
        const before = Math.floor(Date.now() / 1000);
        const res = await request(app).post('/idv-demo/api/mock-google').send({});
        const after = Math.floor(Date.now() / 1000);

        const { iat, exp } = res.body.tokenMeta.idTokenDecoded;
        expect(iat).toBeGreaterThanOrEqual(before);
        expect(iat).toBeLessThanOrEqual(after);
        expect(exp).toBe(iat + 3599);
    });
});

describe('POST /idv-demo/api/mock-microsoft', () => {
    test('returns provider "microsoft" with OID and tenant claims', async () => {
        const res = await request(app).post('/idv-demo/api/mock-microsoft').send({});

        expect(res.status).toBe(200);
        expect(res.body.provider).toBe('microsoft');
        expect(res.body.claims.oid).toBeDefined();
        expect(res.body.claims.tid).toBeDefined();
        expect(res.body.claims.preferred_username).toBe('jane.smith@outlook.com');
    });
});

describe('POST /idv-demo/api/mock-facebook', () => {
    test('returns provider "facebook" with id claim', async () => {
        const res = await request(app).post('/idv-demo/api/mock-facebook').send({});

        expect(res.status).toBe(200);
        expect(res.body.provider).toBe('facebook');
        expect(res.body.claims.id).toBe('10234567890123456');
        expect(res.body.claims.locale).toBe('en_US');
    });
});

// ─── IDV complete endpoint ──────────────────────────────────────────────────

describe('POST /idv-demo/api/idv/complete', () => {
    test('returns a JWT token and verifiedAt timestamp', async () => {
        const res = await request(app)
            .post('/idv-demo/api/idv/complete')
            .send({
                sub: 'user-123',
                name: 'Jane Smith',
                ocrResult: { parsedName: 'Jane Smith', parsedDocNum: 'D1234567' }
            });

        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
        expect(res.body.verifiedAt).toBeDefined();

        // Token must be valid JWT format
        const parts = res.body.token.split('.');
        expect(parts).toHaveLength(3);
    });

    test('token payload contains expected fields', async () => {
        const res = await request(app)
            .post('/idv-demo/api/idv/complete')
            .send({
                sub: 'user-123',
                name: 'Jane Smith',
                ocrResult: { parsedName: 'Jane E. Smith', parsedDocNum: 'X999' }
            });

        const payload = JSON.parse(
            Buffer.from(res.body.token.split('.')[1], 'base64url').toString()
        );

        expect(payload.iss).toBe('idv-demo');
        expect(payload.sub).toBe('user-123');
        expect(payload.name).toBe('Jane Smith');
        expect(payload.docName).toBe('Jane E. Smith');
        expect(payload.docNumber).toBe('X999');
        expect(payload.ialLevel).toBe('IAL1.5');
        expect(payload.jti).toBeDefined();
        expect(payload.verifiedAt).toBeDefined();
    });

    test('handles missing body gracefully (defaults to "unknown")', async () => {
        const res = await request(app)
            .post('/idv-demo/api/idv/complete')
            .send({});

        expect(res.status).toBe(200);
        const payload = JSON.parse(
            Buffer.from(res.body.token.split('.')[1], 'base64url').toString()
        );
        expect(payload.sub).toBe('unknown');
        expect(payload.name).toBe('unknown');
    });
});
