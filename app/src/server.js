const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const dotenv = require('dotenv');

// Load env: production path first, then local .env
if (process.env.NODE_ENV === 'production' && fs.existsSync('/etc/idv-demo/.env')) {
    dotenv.config({ path: '/etc/idv-demo/.env' });
} else {
    dotenv.config();
}

const express = require('express');
const cors = require('cors');
const security = require('./security');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

const port = process.env.PORT || 3002;
const basePath = process.env.BASE_PATH || '/idv-demo';

// ─── Mock personas ────────────────────────────────────────────────────────────

const MOCK_GOOGLE_PERSONA = {
    provider: 'google',
    claims: {
        sub: '1109358203921584729',
        name: 'Jane Smith',
        given_name: 'Jane',
        family_name: 'Smith',
        email: 'jane.smith@gmail.com',
        email_verified: true,
        picture: basePath + '/assets/persona-face.jpg',
        locale: 'en',
        hd: null
    },
    tokenMeta: {
        token_type: 'Bearer',
        scope: 'openid profile email',
        expires_in: 3599,
        idTokenDecoded: {
            iss: 'https://accounts.google.com',
            aud: '1234567890-demo.apps.googleusercontent.com',
            sub: '1109358203921584729',
            email: 'jane.smith@gmail.com',
            email_verified: true,
            iat: 0,
            exp: 0
        }
    }
};

const MOCK_MICROSOFT_PERSONA = {
    provider: 'microsoft',
    claims: {
        oid:                '7f3b2c1d-4e5a-6f7b-8c9d-0e1f2a3b4c5d',
        sub:                '7f3b2c1d-4e5a-6f7b-8c9d-0e1f2a3b4c5d',
        name:               'Jane Smith',
        given_name:         'Jane',
        family_name:        'Smith',
        preferred_username: 'jane.smith@outlook.com',
        email:              'jane.smith@outlook.com',
        email_verified:     true,
        picture:            basePath + '/assets/persona-face.jpg',
        tid:                '9188040d-6c67-4c5b-b112-36a304b66dad',
        ver:                '2.0'
    },
    tokenMeta: {
        token_type: 'Bearer',
        scope:      'openid profile email User.Read',
        expires_in: 3600,
        idTokenDecoded: {
            iss: 'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0',
            aud: '00000003-0000-0000-c000-000000000000',
            sub: '7f3b2c1d-4e5a-6f7b-8c9d-0e1f2a3b4c5d',
            oid: '7f3b2c1d-4e5a-6f7b-8c9d-0e1f2a3b4c5d',
            preferred_username: 'jane.smith@outlook.com',
            tid: '9188040d-6c67-4c5b-b112-36a304b66dad',
            iat: 0,
            exp: 0,
            ver: '2.0'
        }
    }
};

const MOCK_FACEBOOK_PERSONA = {
    provider: 'facebook',
    claims: {
        id:             '10234567890123456',
        sub:            '10234567890123456',
        name:           'Jane Smith',
        email:          'jane.smith@example.com',
        email_verified: null,
        verified:       true,
        picture:        basePath + '/assets/persona-face.jpg',
        locale:         'en_US'
    },
    tokenMeta: {
        token_type: 'Bearer',
        scope:      'email,public_profile',
        expires_in: 5183944,
        idTokenDecoded: {
            iss:   'https://www.facebook.com',
            aud:   '1234567890-demo.apps.facebook.com',
            sub:   '10234567890123456',
            email: 'jane.smith@example.com',
            name:  'Jane Smith',
            iat: 0,
            exp: 0
        }
    }
};

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(security.requestLogger);
app.use(security.securityHeaders());
app.use(security.rateLimiters.general);

const corsOptions = {
    origin: (origin, callback) => {
        const allowed = process.env.ALLOWED_ORIGINS
            ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
            : [];
        if (!origin || allowed.includes(origin) || allowed.length === 0) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    maxAge: 86400
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '64kb' }));

// Static files
app.use(basePath, express.static(path.join(__dirname, 'public'), {
    maxAge: '1h',
    etag: true,
    index: false
}));

// ─── Page routes ──────────────────────────────────────────────────────────────

const pub = path.join(__dirname, 'public');

const pageHandler = (file) => (req, res) => res.sendFile(path.join(pub, file));

const makePageRoutes = (bp) => {
    app.get(bp + '/',          pageHandler('intro.html'));
    app.get(bp,                pageHandler('intro.html'));
    app.get(bp + '/signin',    pageHandler('index.html'));
    app.get(bp + '/dashboard', pageHandler('dashboard.html'));
    app.get(bp + '/idv',       pageHandler('idv.html'));
    app.get(bp + '/liveness',  pageHandler('liveness.html'));
    app.get(bp + '/binding',   pageHandler('binding.html'));
    app.get(bp + '/error',     pageHandler('error.html'));
};

makePageRoutes(basePath);
makePageRoutes(''); // proxy-stripping resilience

// ─── API routes ───────────────────────────────────────────────────────────────

// POST /api/mock-{provider} — return persona JSON (no session write)
const makePersonaHandler = (template) => (req, res) => {
    const now = Math.floor(Date.now() / 1000);
    const persona = JSON.parse(JSON.stringify(template));
    persona.tokenMeta.idTokenDecoded.iat = now;
    persona.tokenMeta.idTokenDecoded.exp = now + template.tokenMeta.expires_in;
    persona.receivedAt = new Date().toISOString();
    res.json(persona);
};

const mockGoogleHandler    = makePersonaHandler(MOCK_GOOGLE_PERSONA);
const mockMicrosoftHandler = makePersonaHandler(MOCK_MICROSOFT_PERSONA);
const mockFacebookHandler  = makePersonaHandler(MOCK_FACEBOOK_PERSONA);

// ─── Verification token ───────────────────────────────────────────────────────

function mintVerificationToken(payload) {
    const secret = process.env.SESSION_SECRET || 'dev-secret-change-me';
    const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body    = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig     = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${sig}`;
}

const idvCompleteHandler = (req, res) => {
    const { sub, name, ocrResult } = req.body || {};
    const now = new Date().toISOString();
    const payload = {
        iss:        'idv-demo',
        sub:        sub        || 'unknown',
        name:       name       || 'unknown',
        docName:    ocrResult?.parsedName   || null,
        docNumber:  ocrResult?.parsedDocNum || null,
        ialLevel:   'IAL1.5',
        verifiedAt: now,
        jti:        crypto.randomBytes(8).toString('hex')
    };
    res.json({ token: mintVerificationToken(payload), verifiedAt: now });
};

const makeApiRoutes = (bp) => {
    app.post(bp + '/api/mock-google',     mockGoogleHandler);
    app.post(bp + '/api/mock-microsoft',  mockMicrosoftHandler);
    app.post(bp + '/api/mock-facebook',   mockFacebookHandler);
    app.post(bp + '/api/idv/complete',    idvCompleteHandler);
};

makeApiRoutes(basePath);
makeApiRoutes('');

// ─── Error handling ───────────────────────────────────────────────────────────

app.use(security.secureErrorHandler);

// ─── Start server ─────────────────────────────────────────────────────────────

const server = app.listen(port, '127.0.0.1', () => {
    console.log(`IDV Demo running at http://localhost:${port}${basePath}/`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

function gracefulShutdown(signal) {
    console.log(`${signal} received — shutting down`);
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
    setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

module.exports = { app, mintVerificationToken };
