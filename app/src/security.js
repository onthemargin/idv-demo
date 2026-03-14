const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const createRateLimiter = (windowMs, max, message) => {
    return rateLimit({
        windowMs,
        max,
        message,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
            res.status(429).json({
                error: message,
                retryAfter: Math.ceil(windowMs / 1000)
            });
        }
    });
};

const rateLimiters = {
    general: createRateLimiter(
        15 * 60 * 1000,
        200,
        'Too many requests, please try again later.'
    ),
    api: createRateLimiter(
        15 * 60 * 1000,
        50,
        'API rate limit exceeded, please try again later.'
    )
};

// CSP extended for Tesseract.js + face-api.js CDN + camera + web workers
const securityHeaders = () => {
    return helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'", "cdn.jsdelivr.net"],
                scriptSrcAttr: ["'none'"],
                imgSrc: ["'self'", "data:", "https:"],
                connectSrc: ["'self'", "cdn.jsdelivr.net"],
                fontSrc: ["'self'"],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'"],
                workerSrc: ["'self'", "blob:"],
                frameSrc: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
                frameAncestors: ["'none'"],
                upgradeInsecureRequests: []
            }
        },
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
        },
        referrerPolicy: {
            policy: 'strict-origin-when-cross-origin'
        },
        permissionsPolicy: {
            features: {
                camera: ["'self'"],
                microphone: ["'none'"],
                geolocation: ["'none'"]
            }
        }
    });
};

const requestLogger = (req, res, next) => {
    const start = Date.now();
    const ip = req.ip || req.connection.remoteAddress;

    res.on('finish', () => {
        const duration = Date.now() - start;
        if (res.statusCode >= 400) {
            console.log(JSON.stringify({
                timestamp: new Date().toISOString(),
                method: req.method,
                path: req.path,
                status: res.statusCode,
                duration: `${duration}ms`,
                ip
            }));
        }
    });

    next();
};

const secureErrorHandler = (err, req, res, next) => {
    console.error('Error:', err.stack);
    const message = process.env.NODE_ENV === 'production'
        ? 'An error occurred processing your request'
        : err.message;
    res.status(err.status || 500).json({ error: message });
};

module.exports = {
    rateLimiters,
    securityHeaders,
    requestLogger,
    secureErrorHandler
};
